import { ItemStack, system, world } from "@minecraft/server";

import { enqueueUniqueKernelTask, registerKernelTaskGroup, registerTickHandler } from "../kernel/index.js";
import { DeferredPersistence } from "../kernel/deferred-persistence.js";
import { deserializeVersionedState } from "../kernel/versioned-state.js";
import { PRESSING_RECIPES } from "./generated/pressing-recipes.js";
import { MechanicalPressMachine } from "./mechanical-press-machine.js";
import { supportedProcessingRecipes } from "./processing-item-support.js";
import { registerMovingBlockDataAdapter } from "../contraptions/moving-block-data.js";
import { createShardedMachineState } from "./sharded-machine-state.js";

const PRESS_BLOCK = "createbedrock:mechanical_press";
const LEGACY_PERSISTENCE_KEY = "createbedrock:mechanical_presses_v1";
const PERSISTENCE_SCHEMA_VERSION = 1;
const MECHANICAL_PRESS_TASK_GROUP = "mechanical_presses";
const MECHANICAL_PRESS_TASK_BUDGET = 4;
const ACTIVE_PRESSING_RECIPES = supportedProcessingRecipes(PRESSING_RECIPES);
const presses = new Map();
const shardedState = createShardedMachineState({
	keyPrefix: "createbedrock:mechanical_press_state_v2",
	legacyKey: LEGACY_PERSISTENCE_KEY,
	name: "mechanical press",
	world
});

function snapshot() {
	return [...presses.values()].map(press => ({
		dimensionId: press.dimensionId,
		location: press.location,
		processor: press.machine.snapshot()
	}));
}

const persistence = new DeferredPersistence({
	name: "mechanical_presses",
	write() {
		shardedState.request(snapshot());
	},
	onError(error) {
		console.warn(`[Create Bedrock] Could not persist mechanical press state: ${error}`);
	}
});

function keyFor(dimensionId, location) {
	return `${dimensionId}:${location.x}:${location.y}:${location.z}`;
}

function createPressMachine(dimensionId, location) {
	return new MechanicalPressMachine(ACTIVE_PRESSING_RECIPES, { id: `mechanical-press:${keyFor(dimensionId, location)}` });
}

function persist() {
	persistence.request();
}

function ensurePress(block) {
	const key = keyFor(block.dimension.id, block.location);
	let press = presses.get(key);
	if (!press) {
		press = {
			dimensionId: block.dimension.id,
			location: { ...block.location },
			machine: createPressMachine(block.dimension.id, block.location)
		};
		presses.set(key, press);
	}
	return press;
}

function capturePress(dimensionId, location) {
	return presses.get(keyFor(dimensionId, location))?.machine.snapshot();
}

function detachPress(dimensionId, location) {
	const key = keyFor(dimensionId, location);
	const state = capturePress(dimensionId, location);
	presses.delete(key);
	persist();
	return state;
}

function restorePress(dimensionId, location, state) {
	const machine = createPressMachine(dimensionId, location);
	machine.restore(state);
	presses.set(keyFor(dimensionId, location), {
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
				console.warn(`[Create Bedrock] Ignored invalid mechanical press shard ${warning.partition}: ${warning.error}`);
			console.warn("[Create Bedrock] Restored sharded mechanical press state");
			return;
		}
	} catch (error) {
		console.warn(`[Create Bedrock] Could not restore sharded mechanical press state: ${error}`);
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
		console.warn(`[Create Bedrock] Ignored invalid mechanical press state: ${error}`);
	}
}

function restoreRecords(records) {
	if (!Array.isArray(records))
		throw new TypeError("Mechanical press records must be an array");
	for (const entry of records) {
		try {
			if (!entry?.dimensionId || !entry?.location)
				throw new TypeError("missing record location");
			const machine = createPressMachine(entry.dimensionId, entry.location);
			machine.restore(entry.processor);
			presses.set(keyFor(entry.dimensionId, entry.location), {
				dimensionId: entry.dimensionId,
				location: entry.location,
				machine
			});
		} catch (error) {
			console.warn(`[Create Bedrock] Ignored invalid mechanical press ${entry?.dimensionId ?? "unknown"}: ${error}`);
		}
	}
}

function tryInsertFromPlayer(player, press) {
	const inventory = player.getComponent("minecraft:inventory")?.container;
	const slot = player.selectedSlotIndex;
	if (!inventory || !Number.isInteger(slot) || slot < 0 || slot >= inventory.size)
		return false;
	const stack = inventory.getItem(slot);
	if (!stack)
		return false;
	const inserted = press.machine.insertInput({ typeId: stack.typeId, count: stack.amount });
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

function tryExtractToPlayer(player, press) {
	const inventory = player.getComponent("minecraft:inventory")?.container;
	const slot = player.selectedSlotIndex;
	if (!inventory || !Number.isInteger(slot) || slot < 0 || slot >= inventory.size || inventory.getItem(slot) !== undefined)
		return false;
	const output = press.machine.peekOutput();
	const input = output ? undefined : press.machine.peekInput();
	const next = output ?? input;
	if (!next)
		return false;
	let physical;
	try {
		physical = new ItemStack(next.typeId, next.count);
	} catch (error) {
		console.warn(`[Create Bedrock] Could not recreate mechanical press inventory item: ${error}`);
		return false;
	}
	const extracted = output ? press.machine.extractOutput() : press.machine.extractInput();
	if (!extracted || extracted.typeId !== next.typeId || extracted.count !== next.count)
		throw new Error("Mechanical press inventory changed while extracting an item");
	inventory.setItem(slot, physical);
	return true;
}

function processPress(key, getKineticWorld) {
	const press = presses.get(key);
	if (!press)
		return;
	const update = press.machine.tick(getKineticWorld().speedAt(press.dimensionId, press.location));
	if (update)
		persist();
}

export function registerMechanicalPresses(getKineticWorld) {
	registerKernelTaskGroup(MECHANICAL_PRESS_TASK_GROUP, MECHANICAL_PRESS_TASK_BUDGET);
	registerMovingBlockDataAdapter(PRESS_BLOCK, {
		capture: capturePress,
		detach: detachPress,
		restore: restorePress,
		schemaVersion: 1,
		validate(state) {
			if (!state || typeof state !== "object" || Array.isArray(state))
				throw new TypeError("Mechanical Press moving data must be a machine snapshot");
		}
	});
	world.afterEvents.playerPlaceBlock.subscribe(event => {
		if (event.block.typeId === PRESS_BLOCK) {
			ensurePress(event.block);
			persist();
		}
	});
	world.afterEvents.playerBreakBlock.subscribe(event => {
		if (presses.delete(keyFor(event.dimension.id, event.block.location)))
			persist();
	});
	world.beforeEvents.playerBreakBlock.subscribe(event => {
		if (event.block.typeId !== PRESS_BLOCK)
			return;
		if (!presses.get(keyFor(event.block.dimension.id, event.block.location))?.machine.hasContents())
			return;
		event.cancel = true;
		event.player.sendMessage("Cannot remove a mechanical press while it stores or processes items.");
	});
	world.afterEvents.playerInteractWithBlock.subscribe(event => {
		if (event.block.typeId !== PRESS_BLOCK)
			return;
		const press = ensurePress(event.block);
		const changed = event.itemStack
			? tryInsertFromPlayer(event.player, press)
			: tryExtractToPlayer(event.player, press);
		if (changed)
			persist();
	});
	registerTickHandler(() => {
		for (const key of presses.keys())
			enqueueUniqueKernelTask(`mechanical_press:${key}`, () => processPress(key, getKineticWorld), MECHANICAL_PRESS_TASK_GROUP);
		persistence.tick();
		shardedState.tick();
	});
	system.run(restore);
}
