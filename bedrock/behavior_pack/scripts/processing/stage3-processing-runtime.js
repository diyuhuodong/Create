import { ItemStack, system, world } from "@minecraft/server";

import { DeferredPersistence } from "../kernel/deferred-persistence.js";
import { enqueueUniqueKernelTask, registerKernelTaskGroup, registerTickHandler } from "../kernel/index.js";
import { BatchProcessingMachine } from "./batch-processing-machine.js";
import { BASIN_RECIPES } from "./generated/basin-recipes.js";
import { CUTTING_RECIPES } from "./generated/cutting-recipes.js";
import { FAN_RECIPES } from "./generated/fan-recipes.js";
import { createShardedMachineState } from "./sharded-machine-state.js";

const BASIN_BLOCK = "createbedrock:basin";
const FAN_BLOCK = "createbedrock:encased_fan";
const MIXER_BLOCK = "createbedrock:mechanical_mixer";
const PRESS_BLOCK = "createbedrock:mechanical_press";
const SAW_BLOCK = "createbedrock:mechanical_saw";
const STAGE3_PROCESSING_TASK_GROUP = "stage3_processing";
const STAGE3_PROCESSING_TASK_BUDGET = 6;

const MACHINE_DEFINITIONS = new Map([
	[BASIN_BLOCK, { inputSlots: 9, outputSlots: 4, recipes: BASIN_RECIPES }],
	[FAN_BLOCK, { inputSlots: 1, outputSlots: 4, recipes: FAN_RECIPES }],
	[SAW_BLOCK, { inputSlots: 1, outputSlots: 4, recipes: CUTTING_RECIPES }]
]);

const FACING_OFFSETS = {
	0: { x: 0, y: -1, z: 0 },
	1: { x: 0, y: 1, z: 0 },
	2: { x: 0, y: 0, z: -1 },
	3: { x: 0, y: 0, z: 1 },
	4: { x: -1, y: 0, z: 0 },
	5: { x: 1, y: 0, z: 0 }
};

const machines = new Map();
const shardedState = createShardedMachineState({
	keyPrefix: "createbedrock:stage3_processing_state_v1",
	name: "stage-3 processing machine",
	world
});

function keyFor(dimensionId, location) {
	return `${dimensionId}:${location.x}:${location.y}:${location.z}`;
}

function snapshot() {
	return [...machines.values()].map(machine => ({
		blockType: machine.blockType,
		dimensionId: machine.dimensionId,
		location: machine.location,
		processor: machine.processor.snapshot()
	}));
}

const persistence = new DeferredPersistence({
	name: "stage3_processing",
	write() {
		shardedState.request(snapshot());
	},
	onError(error) {
		console.warn(`[Create Bedrock] Could not persist S3-11 processing state: ${error}`);
	}
});

function persist() {
	persistence.request();
}

function definitionFor(blockType) {
	const definition = MACHINE_DEFINITIONS.get(blockType);
	if (!definition)
		throw new Error(`Unsupported S3-11 processing block ${blockType}`);
	return definition;
}

function createMachine(blockType, dimensionId, location) {
	const definition = definitionFor(blockType);
	return new BatchProcessingMachine(definition.recipes, {
		id: `${blockType}:${keyFor(dimensionId, location)}`,
		inputSlots: definition.inputSlots,
		outputSlots: definition.outputSlots
	});
}

function ensureMachine(block) {
	const key = keyFor(block.dimension.id, block.location);
	let machine = machines.get(key);
	if (!machine) {
		machine = {
			blockType: block.typeId,
			dimensionId: block.dimension.id,
			location: { ...block.location },
			processor: createMachine(block.typeId, block.dimension.id, block.location)
		};
		machines.set(key, machine);
	}
	return machine;
}

function machineAt(dimensionId, location) {
	return machines.get(keyFor(dimensionId, location));
}

function restoreRecords(records) {
	if (!Array.isArray(records))
		throw new TypeError("S3-11 processing records must be an array");
	for (const record of records) {
		try {
			if (!record?.dimensionId || !record?.location || !MACHINE_DEFINITIONS.has(record.blockType))
				throw new TypeError("missing processing-machine identity");
			const processor = createMachine(record.blockType, record.dimensionId, record.location);
			processor.restore(record.processor);
			machines.set(keyFor(record.dimensionId, record.location), {
				blockType: record.blockType,
				dimensionId: record.dimensionId,
				location: { ...record.location },
				processor
			});
		} catch (error) {
			console.warn(`[Create Bedrock] Ignored invalid S3-11 processing record: ${error}`);
		}
	}
}

function restore() {
	try {
		const restored = shardedState.read();
		if (!restored)
			return;
		restoreRecords(restored.records);
		for (const warning of restored.warnings)
			console.warn(`[Create Bedrock] Ignored invalid S3-11 processing shard ${warning.partition}: ${warning.error}`);
		console.warn("[Create Bedrock] Restored sharded S3-11 processing state");
	} catch (error) {
		console.warn(`[Create Bedrock] Could not restore S3-11 processing state: ${error}`);
	}
}

function tryInsertFromPlayer(player, machine) {
	const inventory = player.getComponent("minecraft:inventory")?.container;
	const slot = player.selectedSlotIndex;
	if (!inventory || !Number.isInteger(slot) || slot < 0 || slot >= inventory.size)
		return false;
	const stack = inventory.getItem(slot);
	if (!stack)
		return false;
	const inserted = machine.processor.insertInput({ count: stack.amount, typeId: stack.typeId });
	if (!inserted.accepted)
		return false;
	if (stack.amount === inserted.accepted.count)
		inventory.setItem(slot);
	else {
		const remaining = stack.clone();
		remaining.amount -= inserted.accepted.count;
		inventory.setItem(slot, remaining);
	}
	return true;
}

function tryExtractToPlayer(player, machine) {
	const inventory = player.getComponent("minecraft:inventory")?.container;
	const slot = player.selectedSlotIndex;
	if (!inventory || !Number.isInteger(slot) || slot < 0 || slot >= inventory.size || inventory.getItem(slot) !== undefined)
		return false;
	const output = machine.processor.peekOutput();
	const input = output ? undefined : machine.processor.peekInput();
	const next = output ?? input;
	if (!next)
		return false;
	let physical;
	try {
		physical = new ItemStack(next.typeId, next.count);
	} catch (error) {
		console.warn(`[Create Bedrock] Could not recreate S3-11 processing inventory item: ${error}`);
		return false;
	}
	const extracted = output ? machine.processor.extractOutput() : machine.processor.extractInput();
	if (!extracted || extracted.typeId !== next.typeId || extracted.count !== next.count)
		throw new Error("S3-11 processing inventory changed while extracting an item");
	inventory.setItem(slot, physical);
	return true;
}

function blockAbove(machine) {
	return world.getDimension(machine.dimensionId).getBlock({
		x: machine.location.x,
		y: machine.location.y + 1,
		z: machine.location.z
	});
}

function basinController(machine, getKineticWorld) {
	const controller = blockAbove(machine);
	if (controller?.typeId === MIXER_BLOCK)
		return { mode: "mixing", speed: getKineticWorld().speedAt(machine.dimensionId, controller.location) };
	if (controller?.typeId === PRESS_BLOCK)
		return { mode: "compacting", speed: getKineticWorld().speedAt(machine.dimensionId, controller.location) };
	return undefined;
}

function fanMode(machine, speed) {
	const dimension = world.getDimension(machine.dimensionId);
	const fan = dimension.getBlock(machine.location);
	const facing = fan?.permutation?.getState("minecraft:facing_direction");
	const front = FACING_OFFSETS[facing] ?? FACING_OFFSETS[3];
	const offset = speed < 0
		? { x: -front.x, y: -front.y, z: -front.z }
		: front;
	const target = dimension.getBlock({
		x: machine.location.x + offset.x,
		y: machine.location.y + offset.y,
		z: machine.location.z + offset.z
	});
	switch (target?.typeId) {
		case "minecraft:water":
			return "splashing";
		case "minecraft:soul_fire":
		case "minecraft:soul_sand":
		case "minecraft:soul_soil":
			return "haunting";
		case "minecraft:campfire":
			return "smoking";
		case "minecraft:fire":
		case "minecraft:lava":
		case "minecraft:magma":
			return "blasting";
		default:
			return undefined;
	}
}

function workUnits(speed) {
	return Math.max(1, Math.floor(Math.abs(speed) / 16));
}

function processMachine(key, getKineticWorld) {
	const machine = machines.get(key);
	if (!machine)
		return;
	let controller;
	if (machine.blockType === BASIN_BLOCK)
		controller = basinController(machine, getKineticWorld);
	else if (machine.blockType === FAN_BLOCK) {
		const speed = getKineticWorld().speedAt(machine.dimensionId, machine.location);
		const mode = fanMode(machine, speed);
		controller = mode && { mode, speed };
	} else
		controller = { mode: "cutting", speed: getKineticWorld().speedAt(machine.dimensionId, machine.location) };
	if (!controller) {
		const update = machine.processor.tick();
		if (update)
			persist();
		return;
	}
	const update = machine.processor.tick({
		mode: controller.mode,
		powered: controller.speed !== 0,
		workUnits: workUnits(controller.speed)
	});
	if (update)
		persist();
}

function basinBelow(block) {
	const below = block.dimension.getBlock({ x: block.location.x, y: block.location.y - 1, z: block.location.z });
	return below?.typeId === BASIN_BLOCK ? ensureMachine(below) : undefined;
}

function interactionMachine(block) {
	if (MACHINE_DEFINITIONS.has(block.typeId))
		return ensureMachine(block);
	if (block.typeId === MIXER_BLOCK)
		return basinBelow(block);
	return undefined;
}

function isProtectedBreak(block) {
	const machine = interactionMachine(block);
	return machine?.processor.hasContents() ?? false;
}

function deleteMachine(block) {
	if (MACHINE_DEFINITIONS.has(block.typeId) && machines.delete(keyFor(block.dimension.id, block.location)))
		persist();
}

export function getStage3ProcessingDiagnostics() {
	return {
		machines: machines.size,
		persistedMachines: snapshot().length,
		state: shardedState.diagnostics()
	};
}

export function registerStage3Processing(getKineticWorld) {
	registerKernelTaskGroup(STAGE3_PROCESSING_TASK_GROUP, STAGE3_PROCESSING_TASK_BUDGET);
	world.afterEvents.playerPlaceBlock.subscribe(event => {
		if (MACHINE_DEFINITIONS.has(event.block.typeId)) {
			ensureMachine(event.block);
			persist();
		}
	});
	world.beforeEvents.playerBreakBlock.subscribe(event => {
		if (!MACHINE_DEFINITIONS.has(event.block.typeId) && event.block.typeId !== MIXER_BLOCK)
			return;
		if (!isProtectedBreak(event.block))
			return;
		event.cancel = true;
		event.player.sendMessage("Cannot remove this processing machine while it stores or processes items.");
	});
	world.afterEvents.playerBreakBlock.subscribe(event => deleteMachine(event.block));
	world.afterEvents.playerInteractWithBlock.subscribe(event => {
		const machine = interactionMachine(event.block);
		if (!machine)
			return;
		const changed = event.itemStack
			? tryInsertFromPlayer(event.player, machine)
			: tryExtractToPlayer(event.player, machine);
		if (changed)
			persist();
	});
	registerTickHandler(() => {
		for (const key of machines.keys())
			enqueueUniqueKernelTask(`s3_processing:${key}`, () => processMachine(key, getKineticWorld), STAGE3_PROCESSING_TASK_GROUP);
		persistence.tick();
		shardedState.tick();
	});
	system.run(restore);
}
