import { ItemStack, system, world } from "@minecraft/server";

import { fluidPortForBlock } from "../fluids/fluid-runtime.js";
import { enqueueUniqueKernelTask, registerKernelTaskGroup, registerTickHandler } from "../kernel/index.js";
import { PROJECTED_ITEM_TAGS } from "./generated/p7-2-item-tags.js";
import { INTERACTION_RECIPES } from "./generated/interaction-recipes.js";
import { InteractionProcessingController } from "./interaction-processing-controller.js";
import { createShardedMachineState } from "./sharded-machine-state.js";
import { registerSequencedAssemblyStationResolver } from "./sequenced-assembly-station-registry.js";

const DEPLOYER_BLOCK = "createbedrock:deployer";
const SPOUT_BLOCK = "createbedrock:spout";
const INTERACTION_BLOCKS = new Set([DEPLOYER_BLOCK, SPOUT_BLOCK]);
const INTERACTION_TASK_GROUP = "interaction_processing";
const INTERACTION_TASK_BUDGET = 4;
const FLUID_NEIGHBORS = [{ x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 }, { x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }];

const machines = new Map();
const shardedState = createShardedMachineState({
	keyPrefix: "createbedrock:interaction_processing_v1",
	name: "interaction-processing machine",
	world
});
let registered = false;

function keyFor(dimensionId, location) {
	return `${dimensionId}:${location.x}:${location.y}:${location.z}`;
}

function matchesTag(tag, typeId) {
	return PROJECTED_ITEM_TAGS.get(tag)?.has(typeId) ?? false;
}

function createController(typeId, dimensionId, location) {
	return new InteractionProcessingController(INTERACTION_RECIPES, {
		id: `${typeId}:${keyFor(dimensionId, location)}`,
		inputSlots: 1,
		outputSlots: 4
	});
}

function ensureMachine(block) {
	if (!INTERACTION_BLOCKS.has(block?.typeId))
		return undefined;
	const key = keyFor(block.dimension.id, block.location);
	let machine = machines.get(key);
	if (!machine) {
		machine = {
			controller: createController(block.typeId, block.dimension.id, block.location),
			dimensionId: block.dimension.id,
			location: { ...block.location },
			typeId: block.typeId
		};
		machines.set(key, machine);
	}
	return machine;
}

function records() {
	return [...machines.values()].map(machine => ({
		controller: machine.controller.snapshot(),
		dimensionId: machine.dimensionId,
		location: machine.location,
		typeId: machine.typeId
	}));
}

function persist() {
	shardedState.request(records());
}

function restore() {
	try {
		const restored = shardedState.read();
		if (!restored)
			return;
		for (const record of restored.records) {
			if (!INTERACTION_BLOCKS.has(record?.typeId) || typeof record.dimensionId !== "string" || !record.location)
				throw new TypeError("invalid interaction-processing record");
			const controller = createController(record.typeId, record.dimensionId, record.location);
			controller.restore(record.controller);
			machines.set(keyFor(record.dimensionId, record.location), { ...record, controller, location: { ...record.location } });
		}
		for (const warning of restored.warnings)
			console.warn(`[Create Bedrock] Ignored invalid interaction-processing shard ${warning.partition}: ${warning.error}`);
	} catch (error) {
		console.warn(`[Create Bedrock] Could not restore interaction-processing state: ${error}`);
	}
}

function controllerHasContents(controller) {
	const state = controller.inspect();
	return [state.held, state.input, state.output].some(port => port.slots.some(Boolean));
}

function nearbyFluidPort(machine) {
	const dimension = world.getDimension(machine.dimensionId);
	for (const offset of FLUID_NEIGHBORS) {
		const block = dimension.getBlock({
			x: machine.location.x + offset.x,
			y: machine.location.y + offset.y,
			z: machine.location.z + offset.z
		});
		const port = fluidPortForBlock(block);
		if (port)
			return port;
	}
	return undefined;
}

function workMachine(key, kineticWorld) {
	const machine = machines.get(key);
	if (!machine)
		return false;
	const speed = kineticWorld.speedAt(machine.dimensionId, machine.location);
	if (speed === 0)
		return false;
	const update = machine.controller.tick({
		fluidPort: machine.typeId === SPOUT_BLOCK ? nearbyFluidPort(machine) : undefined,
		matchesTag,
		random: () => Math.random()
	});
	if (update?.accepted)
		persist();
	return update?.accepted === true;
}

function interactionStationForCarrier(carrier, getKineticWorld) {
	for (const machine of machines.values()) {
		if (machine.dimensionId !== carrier.dimensionId || getKineticWorld().speedAt(machine.dimensionId, machine.location) === 0)
			continue;
		const below = machine.location.x === carrier.location.x && machine.location.y - 1 === carrier.location.y && machine.location.z === carrier.location.z;
		const adjacent = Math.abs(machine.location.x - carrier.location.x) + Math.abs(machine.location.y - carrier.location.y) + Math.abs(machine.location.z - carrier.location.z) === 1;
		if ((machine.typeId === SPOUT_BLOCK && !below) || (machine.typeId === DEPLOYER_BLOCK && !adjacent))
			continue;
		return machine.typeId === SPOUT_BLOCK
			? { fluidPort: nearbyFluidPort(machine), id: `spout:${keyFor(machine.dimensionId, machine.location)}`, persist, stationType: "create:filling" }
			: { id: `deployer:${keyFor(machine.dimensionId, machine.location)}`, itemPort: machine.controller.heldPort, persist, stationType: "create:deploying" };
	}
	return undefined;
}

function selected(player) {
	const inventory = player?.getComponent("minecraft:inventory")?.container;
	const slot = player?.selectedSlotIndex;
	if (!inventory || !Number.isInteger(slot) || slot < 0 || slot >= inventory.size)
		return undefined;
	return { inventory, slot, stack: inventory.getItem(slot) };
}

function removeOne(selection) {
	if (!selection?.stack || selection.stack.amount < 1)
		return undefined;
	const taken = selection.stack.clone();
	taken.amount = 1;
	if (selection.stack.amount === 1)
		selection.inventory.setItem(selection.slot);
	else {
		const remainder = selection.stack.clone();
		remainder.amount--;
		selection.inventory.setItem(selection.slot, remainder);
	}
	return taken;
}

function give(player, stack) {
	const inventory = player?.getComponent("minecraft:inventory")?.container;
	if (!inventory)
		return false;
	const physical = new ItemStack(stack.typeId, stack.count);
	const remainder = inventory.addItem(physical);
	if (remainder)
		player.dimension.spawnItem(remainder, player.location);
	return true;
}

function extractToPlayer(player, controller) {
	for (const port of [controller.outputPort, controller.inputPort, controller.heldPort]) {
		const reservation = port.reserve();
		if (!reservation)
			continue;
		if (!give(player, reservation.item))
			return false;
		port.extract(reservation, { receiptId: `interaction:player-extract:${port.id}:${reservation.item.typeId}` });
		return true;
	}
	return false;
}

function configureHeldItem(player, controller) {
	const selection = selected(player);
	if (!selection?.stack)
		return extractToPlayer(player, controller);
	if (controller.heldPort.inspect().slots.some(Boolean))
		return false;
	const inserted = controller.heldPort.insert({ count: 1, typeId: selection.stack.typeId });
	if (!inserted.accepted)
		return false;
	removeOne(selection);
	return true;
}

function enqueueInput(player, controller) {
	const selection = selected(player);
	if (!selection?.stack)
		return extractToPlayer(player, controller);
	const inserted = controller.inputPort.insert({ count: 1, typeId: selection.stack.typeId });
	if (!inserted.accepted)
		return false;
	removeOne(selection);
	return true;
}

export function getInteractionProcessingDiagnostics() {
	return { machines: machines.size, persistedMachines: records().length, state: shardedState.diagnostics() };
}

export function registerInteractionProcessing(getKineticWorld) {
	if (registered)
		return false;
	registered = true;
	registerKernelTaskGroup(INTERACTION_TASK_GROUP, INTERACTION_TASK_BUDGET);
	registerSequencedAssemblyStationResolver("interaction-processing", carrier => interactionStationForCarrier(carrier, getKineticWorld));
	world.afterEvents.playerPlaceBlock.subscribe(event => {
		if (ensureMachine(event.block))
			persist();
	});
	world.beforeEvents.playerBreakBlock.subscribe(event => {
		const machine = machines.get(keyFor(event.block.dimension.id, event.block.location));
		if (!machine || !controllerHasContents(machine.controller))
			return;
		event.cancel = true;
		event.player.sendMessage("Remove the stored Deployer/Spout items before breaking it.");
	});
	world.afterEvents.playerBreakBlock.subscribe(event => {
		if (machines.delete(keyFor(event.block.dimension.id, event.block.location)))
			persist();
	});
	world.afterEvents.playerInteractWithBlock.subscribe(event => {
		const machine = ensureMachine(event.block);
		if (!machine)
			return;
		const changed = machine.typeId === DEPLOYER_BLOCK && event.player.isSneaking
			? configureHeldItem(event.player, machine.controller)
			: enqueueInput(event.player, machine.controller);
		if (changed)
			persist();
	});
	registerTickHandler(() => {
		for (const key of machines.keys())
			enqueueUniqueKernelTask(`interaction_processing:${key}`, () => workMachine(key, getKineticWorld()), INTERACTION_TASK_GROUP);
		shardedState.tick();
	}, INTERACTION_TASK_GROUP);
	system.run(restore);
	return true;
}
