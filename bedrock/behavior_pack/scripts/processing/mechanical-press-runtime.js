import { ItemStack, system, world } from "@minecraft/server";

import { enqueueUniqueKernelTask, registerKernelTaskGroup, registerTickHandler } from "../kernel/index.js";
import { PRESSING_RECIPES } from "./generated/pressing-recipes.js";
import { MechanicalPressMachine } from "./mechanical-press-machine.js";
import { registerMovingBlockDataAdapter } from "../contraptions/moving-block-data.js";

const PRESS_BLOCK = "createbedrock:mechanical_press";
const PERSISTENCE_KEY = "createbedrock:mechanical_presses_v1";
const MECHANICAL_PRESS_TASK_GROUP = "mechanical_presses";
const MECHANICAL_PRESS_TASK_BUDGET = 4;
const REGISTERED_CREATE_ITEMS = new Set([
	"createbedrock:copper_sheet",
	"createbedrock:golden_sheet",
	"createbedrock:iron_sheet"
]);
const ACTIVE_PRESSING_RECIPES = PRESSING_RECIPES.filter(recipe => recipe.outputs.every(output =>
	!output.typeId.startsWith("createbedrock:") || REGISTERED_CREATE_ITEMS.has(output.typeId)));
const presses = new Map();

function keyFor(dimensionId, location) {
	return `${dimensionId}:${location.x}:${location.y}:${location.z}`;
}

function persist() {
	world.setDynamicProperty(PERSISTENCE_KEY, JSON.stringify([...presses.values()].map(press => ({
		dimensionId: press.dimensionId,
		location: press.location,
		processor: press.machine.snapshot()
	}))));
}

function ensurePress(block) {
	const key = keyFor(block.dimension.id, block.location);
	let press = presses.get(key);
	if (!press) {
		press = {
			dimensionId: block.dimension.id,
			location: { ...block.location },
			machine: new MechanicalPressMachine(ACTIVE_PRESSING_RECIPES)
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
	const machine = new MechanicalPressMachine(ACTIVE_PRESSING_RECIPES);
	machine.restore(state);
	presses.set(keyFor(dimensionId, location), {
		dimensionId,
		location: { ...location },
		machine
	});
	persist();
}

function restore() {
	const serialized = world.getDynamicProperty(PERSISTENCE_KEY);
	if (typeof serialized !== "string")
		return;
	try {
		for (const entry of JSON.parse(serialized)) {
			if (!entry?.dimensionId || !entry?.location)
				continue;
			const machine = new MechanicalPressMachine(ACTIVE_PRESSING_RECIPES);
			machine.restore(entry.processor);
			presses.set(keyFor(entry.dimensionId, entry.location), {
				dimensionId: entry.dimensionId,
				location: entry.location,
				machine
			});
		}
	} catch (error) {
		console.warn(`[Create Bedrock] Ignored invalid mechanical press state: ${error}`);
	}
}

function tryInsertFromPlayer(player, press) {
	const inventory = player.getComponent("minecraft:inventory")?.container;
	if (!inventory)
		return false;
	for (let slot = 0; slot < inventory.size; slot++) {
		const stack = inventory.getItem(slot);
		if (!stack)
			continue;
		const started = press.machine.tryInsert({ typeId: stack.typeId, count: stack.amount });
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

function processPress(key, getKineticWorld) {
	const press = presses.get(key);
	if (!press)
		return;
	const update = press.machine.tick(getKineticWorld().speedAt(press.dimensionId, press.location));
	if (!update?.completed)
		return;
	const dimension = world.getDimension(press.dimensionId);
	for (const output of update.outputs)
		dimension.spawnItem(new ItemStack(output.typeId, output.count), {
			x: press.location.x + 0.5,
			y: press.location.y + 1,
			z: press.location.z + 0.5
		});
	persist();
}

export function registerMechanicalPresses(getKineticWorld) {
	registerKernelTaskGroup(MECHANICAL_PRESS_TASK_GROUP, MECHANICAL_PRESS_TASK_BUDGET);
	registerMovingBlockDataAdapter(PRESS_BLOCK, {
		capture: capturePress,
		detach: detachPress,
		restore: restorePress
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
	world.afterEvents.playerInteractWithBlock.subscribe(event => {
		if (event.block.typeId === PRESS_BLOCK && tryInsertFromPlayer(event.player, ensurePress(event.block)))
			persist();
	});
	registerTickHandler(() => {
		for (const key of presses.keys())
			enqueueUniqueKernelTask(`mechanical_press:${key}`, () => processPress(key, getKineticWorld), MECHANICAL_PRESS_TASK_GROUP);
	});
	system.run(restore);
}
