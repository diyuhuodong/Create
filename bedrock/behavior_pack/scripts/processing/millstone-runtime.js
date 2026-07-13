import { ItemStack, system, world } from "@minecraft/server";

import { enqueueUniqueKernelTask, registerKernelTaskGroup, registerTickHandler } from "../kernel/index.js";
import { deserializeVersionedState, serializeVersionedState } from "../kernel/versioned-state.js";
import { MILLING_RECIPES } from "./generated/milling-recipes.js";
import { MillstoneMachine } from "./millstone-machine.js";
import { registerMovingBlockDataAdapter } from "../contraptions/moving-block-data.js";

const PERSISTENCE_KEY = "createbedrock:millstones_v1";
const PERSISTENCE_SCHEMA_VERSION = 1;
const MILLSTONE_TASK_GROUP = "millstones";
const MILLSTONE_TASK_BUDGET = 4;
const REGISTERED_CREATE_ITEMS = new Set(["createbedrock:wheat_flour"]);
const ACTIVE_MILLING_RECIPES = MILLING_RECIPES.filter(recipe => recipe.outputs.every(output =>
	!output.typeId.startsWith("createbedrock:") || REGISTERED_CREATE_ITEMS.has(output.typeId)));
const mills = new Map();

function keyFor(dimensionId, location) {
	return `${dimensionId}:${location.x}:${location.y}:${location.z}`;
}

function persist() {
	const snapshot = [...mills.values()].map(mill => ({
		dimensionId: mill.dimensionId,
		location: mill.location,
		processor: mill.machine.snapshot()
	}));
	world.setDynamicProperty(PERSISTENCE_KEY, serializeVersionedState(PERSISTENCE_SCHEMA_VERSION, snapshot));
}

function restore() {
	const serialized = world.getDynamicProperty(PERSISTENCE_KEY);
	if (typeof serialized !== "string")
		return;

	try {
		const records = deserializeVersionedState(serialized, {
			schemaVersion: PERSISTENCE_SCHEMA_VERSION,
			upgrades: { 0: legacy => legacy }
		});
		if (!Array.isArray(records))
			throw new TypeError("Millstone records must be an array");
		for (const entry of records) {
			try {
				if (!entry?.dimensionId || !entry?.location)
					throw new TypeError("missing record location");
				const machine = new MillstoneMachine(ACTIVE_MILLING_RECIPES);
				machine.restore(entry.processor);
				mills.set(keyFor(entry.dimensionId, entry.location), {
					dimensionId: entry.dimensionId,
					location: entry.location,
					machine
				});
			} catch (error) {
				console.warn(`[Create Bedrock] Ignored invalid millstone ${entry?.dimensionId ?? "unknown"}: ${error}`);
			}
		}
	} catch (error) {
		console.warn(`[Create Bedrock] Ignored invalid millstone state: ${error}`);
	}
}

function ensureMill(block) {
	const key = keyFor(block.dimension.id, block.location);
	let mill = mills.get(key);
	if (!mill) {
		mill = {
			dimensionId: block.dimension.id,
			location: { ...block.location },
			machine: new MillstoneMachine(ACTIVE_MILLING_RECIPES)
		};
		mills.set(key, mill);
	}
	return mill;
}

function captureMillstone(dimensionId, location) {
	return mills.get(keyFor(dimensionId, location))?.machine.snapshot();
}

function detachMillstone(dimensionId, location) {
	const key = keyFor(dimensionId, location);
	const state = captureMillstone(dimensionId, location);
	mills.delete(key);
	persist();
	return state;
}

function restoreMillstone(dimensionId, location, state) {
	const machine = new MillstoneMachine(ACTIVE_MILLING_RECIPES);
	machine.restore(state);
	mills.set(keyFor(dimensionId, location), {
		dimensionId,
		location: { ...location },
		machine
	});
	persist();
}

function tryInsertFromPlayer(player, mill) {
	const inventory = player.getComponent("minecraft:inventory")?.container;
	if (!inventory)
		return false;

	for (let slot = 0; slot < inventory.size; slot++) {
		const stack = inventory.getItem(slot);
		if (!stack)
			continue;

		const started = mill.machine.tryInsert({ typeId: stack.typeId, count: stack.amount });
		if (!started)
			continue;

		if (stack.amount === started.consumed.count)
			inventory.setItem(slot);
		else {
			const remaining = stack.clone();
			remaining.amount -= started.consumed.count;
			inventory.setItem(slot, remaining);
		}
		return true;
	}

	return false;
}

function processMill(key, getKineticWorld) {
	const mill = mills.get(key);
	if (!mill)
		return;
	const speed = getKineticWorld().speedAt(mill.dimensionId, mill.location);
	const update = mill.machine.tick(speed);
	if (!update?.completed)
		return;

	const dimension = world.getDimension(mill.dimensionId);
	for (const output of update.outputs)
		dimension.spawnItem(new ItemStack(output.typeId, output.count), {
			x: mill.location.x + 0.5,
			y: mill.location.y + 1,
			z: mill.location.z + 0.5
		});
	persist();
}

export function registerMillstones(getKineticWorld) {
	registerKernelTaskGroup(MILLSTONE_TASK_GROUP, MILLSTONE_TASK_BUDGET);
	registerMovingBlockDataAdapter("createbedrock:millstone", {
		capture: captureMillstone,
		detach: detachMillstone,
		restore: restoreMillstone
	});
	world.afterEvents.playerPlaceBlock.subscribe(event => {
		if (event.block.typeId === "createbedrock:millstone") {
			ensureMill(event.block);
			persist();
		}
	});

	world.afterEvents.playerBreakBlock.subscribe(event => {
		if (mills.delete(keyFor(event.dimension.id, event.block.location)))
			persist();
	});

	world.afterEvents.playerInteractWithBlock.subscribe(event => {
		if (event.block.typeId !== "createbedrock:millstone")
			return;

		if (tryInsertFromPlayer(event.player, ensureMill(event.block)))
			persist();
	});

	registerTickHandler(() => {
		for (const key of mills.keys())
			enqueueUniqueKernelTask(`millstone:${key}`, () => processMill(key, getKineticWorld), MILLSTONE_TASK_GROUP);
	});

	system.run(restore);
}
