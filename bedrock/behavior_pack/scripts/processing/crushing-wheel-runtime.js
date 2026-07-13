import { ItemStack, system, world } from "@minecraft/server";

import { enqueueUniqueKernelTask, registerKernelTaskGroup, registerTickHandler } from "../kernel/index.js";
import { DeferredPersistence } from "../kernel/deferred-persistence.js";
import { deserializeVersionedState } from "../kernel/versioned-state.js";
import { CRUSHING_RECIPES } from "./generated/crushing-recipes.js";
import { CrushingWheelMachine } from "./crushing-wheel-machine.js";
import { supportedProcessingRecipes } from "./processing-item-support.js";
import { registerMovingBlockDataAdapter } from "../contraptions/moving-block-data.js";
import { createShardedMachineState } from "./sharded-machine-state.js";

const CRUSHING_WHEEL_BLOCK = "createbedrock:crushing_wheel";
const LEGACY_PERSISTENCE_KEY = "createbedrock:crushing_wheels_v1";
const PERSISTENCE_SCHEMA_VERSION = 1;
const CRUSHING_WHEEL_TASK_GROUP = "crushing_wheels";
const CRUSHING_WHEEL_TASK_BUDGET = 4;
const ACTIVE_CRUSHING_RECIPES = supportedProcessingRecipes(CRUSHING_RECIPES);
const wheels = new Map();
const shardedState = createShardedMachineState({
	keyPrefix: "createbedrock:crushing_wheel_state_v2",
	legacyKey: LEGACY_PERSISTENCE_KEY,
	name: "crushing wheel",
	world
});

function snapshot() {
	return [...wheels.values()].map(wheel => ({
		dimensionId: wheel.dimensionId,
		location: wheel.location,
		processor: wheel.machine.snapshot()
	}));
}

const persistence = new DeferredPersistence({
	name: "crushing_wheels",
	write() {
		shardedState.request(snapshot());
	},
	onError(error) {
		console.warn(`[Create Bedrock] Could not persist crushing wheel state: ${error}`);
	}
});

function keyFor(dimensionId, location) {
	return `${dimensionId}:${location.x}:${location.y}:${location.z}`;
}

function createCrushingWheelMachine(dimensionId, location) {
	return new CrushingWheelMachine(ACTIVE_CRUSHING_RECIPES, { id: `crushing-wheel:${keyFor(dimensionId, location)}` });
}

function persist() {
	persistence.request();
}

function ensureWheel(block) {
	const key = keyFor(block.dimension.id, block.location);
	let wheel = wheels.get(key);
	if (!wheel) {
		wheel = {
			dimensionId: block.dimension.id,
			location: { ...block.location },
			machine: createCrushingWheelMachine(block.dimension.id, block.location)
		};
		wheels.set(key, wheel);
	}
	return wheel;
}

function captureWheel(dimensionId, location) {
	return wheels.get(keyFor(dimensionId, location))?.machine.snapshot();
}

function detachWheel(dimensionId, location) {
	const key = keyFor(dimensionId, location);
	const state = captureWheel(dimensionId, location);
	wheels.delete(key);
	persist();
	return state;
}

function restoreWheel(dimensionId, location, state) {
	const machine = createCrushingWheelMachine(dimensionId, location);
	machine.restore(state);
	wheels.set(keyFor(dimensionId, location), {
		dimensionId,
		location: { ...location },
		machine
	});
	persist();
}

function restore() {
	try {
		const restored = shardedState.read();
		if (restored) {
			restoreRecords(restored.records);
			for (const warning of restored.warnings)
				console.warn(`[Create Bedrock] Ignored invalid crushing wheel shard ${warning.partition}: ${warning.error}`);
			console.warn("[Create Bedrock] Restored sharded crushing wheel state");
			return;
		}
	} catch (error) {
		console.warn(`[Create Bedrock] Could not restore sharded crushing wheel state: ${error}`);
	}

	const serialized = world.getDynamicProperty(LEGACY_PERSISTENCE_KEY);
	if (typeof serialized !== "string")
		return;
	try {
		const records = deserializeVersionedState(serialized, {
			schemaVersion: PERSISTENCE_SCHEMA_VERSION,
			upgrades: { 0: legacy => legacy }
		});
		restoreRecords(records);
		shardedState.markLegacyForMigration();
		persist();
	} catch (error) {
		console.warn(`[Create Bedrock] Ignored invalid crushing wheel state: ${error}`);
	}
}

function restoreRecords(records) {
	if (!Array.isArray(records))
		throw new TypeError("Crushing wheel records must be an array");
	for (const entry of records) {
		try {
			if (!entry?.dimensionId || !entry?.location)
				throw new TypeError("missing record location");
			const machine = createCrushingWheelMachine(entry.dimensionId, entry.location);
			machine.restore(entry.processor);
			wheels.set(keyFor(entry.dimensionId, entry.location), {
				dimensionId: entry.dimensionId,
				location: entry.location,
				machine
			});
		} catch (error) {
			console.warn(`[Create Bedrock] Ignored invalid crushing wheel ${entry?.dimensionId ?? "unknown"}: ${error}`);
		}
	}
}

function tryInsertFromPlayer(player, wheel) {
	const inventory = player.getComponent("minecraft:inventory")?.container;
	const slot = player.selectedSlotIndex;
	if (!inventory || !Number.isInteger(slot) || slot < 0 || slot >= inventory.size)
		return false;
	const stack = inventory.getItem(slot);
	if (!stack)
		return false;
	const inserted = wheel.machine.insertInput({ typeId: stack.typeId, count: stack.amount });
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

function tryExtractToPlayer(player, wheel) {
	const inventory = player.getComponent("minecraft:inventory")?.container;
	const slot = player.selectedSlotIndex;
	if (!inventory || !Number.isInteger(slot) || slot < 0 || slot >= inventory.size || inventory.getItem(slot) !== undefined)
		return false;
	const output = wheel.machine.peekOutput();
	const input = output ? undefined : wheel.machine.peekInput();
	const next = output ?? input;
	if (!next)
		return false;
	let physical;
	try {
		physical = new ItemStack(next.typeId, next.count);
	} catch (error) {
		console.warn(`[Create Bedrock] Could not recreate crushing wheel inventory item: ${error}`);
		return false;
	}
	const extracted = output ? wheel.machine.extractOutput() : wheel.machine.extractInput();
	if (!extracted || extracted.typeId !== next.typeId || extracted.count !== next.count)
		throw new Error("Crushing wheel inventory changed while extracting an item");
	inventory.setItem(slot, physical);
	return true;
}

function processWheel(key, getKineticWorld) {
	const wheel = wheels.get(key);
	if (!wheel)
		return;
	const update = wheel.machine.tick(getKineticWorld().speedAt(wheel.dimensionId, wheel.location));
	if (update)
		persist();
}

export function registerCrushingWheels(getKineticWorld) {
	registerKernelTaskGroup(CRUSHING_WHEEL_TASK_GROUP, CRUSHING_WHEEL_TASK_BUDGET);
	registerMovingBlockDataAdapter(CRUSHING_WHEEL_BLOCK, {
		capture: captureWheel,
		detach: detachWheel,
		restore: restoreWheel
	});
	world.afterEvents.playerPlaceBlock.subscribe(event => {
		if (event.block.typeId === CRUSHING_WHEEL_BLOCK) {
			ensureWheel(event.block);
			persist();
		}
	});
	world.afterEvents.playerBreakBlock.subscribe(event => {
		if (wheels.delete(keyFor(event.dimension.id, event.block.location)))
			persist();
	});
	world.beforeEvents.playerBreakBlock.subscribe(event => {
		if (event.block.typeId !== CRUSHING_WHEEL_BLOCK)
			return;
		if (!wheels.get(keyFor(event.block.dimension.id, event.block.location))?.machine.hasContents())
			return;
		event.cancel = true;
		event.player.sendMessage("Cannot remove a crushing wheel while it stores or processes items.");
	});
	world.afterEvents.playerInteractWithBlock.subscribe(event => {
		if (event.block.typeId !== CRUSHING_WHEEL_BLOCK)
			return;
		const wheel = ensureWheel(event.block);
		const changed = event.itemStack
			? tryInsertFromPlayer(event.player, wheel)
			: tryExtractToPlayer(event.player, wheel);
		if (changed)
			persist();
	});
	registerTickHandler(() => {
		for (const key of wheels.keys())
			enqueueUniqueKernelTask(`crushing_wheel:${key}`, () => processWheel(key, getKineticWorld), CRUSHING_WHEEL_TASK_GROUP);
		persistence.tick();
		shardedState.tick();
	});
	system.run(restore);
}
