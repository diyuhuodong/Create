import { ItemStack, system, world } from "@minecraft/server";

import { registerTickHandler } from "../kernel/index.js";
import { CRUSHING_RECIPES } from "./generated/crushing-recipes.js";
import { CrushingWheelMachine } from "./crushing-wheel-machine.js";
import { registerMovingBlockDataAdapter } from "../contraptions/moving-block-data.js";

const CRUSHING_WHEEL_BLOCK = "createbedrock:crushing_wheel";
const PERSISTENCE_KEY = "createbedrock:crushing_wheels_v1";
const wheels = new Map();

function keyFor(dimensionId, location) {
	return `${dimensionId}:${location.x}:${location.y}:${location.z}`;
}

function persist() {
	world.setDynamicProperty(PERSISTENCE_KEY, JSON.stringify([...wheels.values()].map(wheel => ({
		dimensionId: wheel.dimensionId,
		location: wheel.location,
		processor: wheel.machine.snapshot()
	}))));
}

function ensureWheel(block) {
	const key = keyFor(block.dimension.id, block.location);
	let wheel = wheels.get(key);
	if (!wheel) {
		wheel = {
			dimensionId: block.dimension.id,
			location: { ...block.location },
			machine: new CrushingWheelMachine(CRUSHING_RECIPES)
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
	const machine = new CrushingWheelMachine(CRUSHING_RECIPES);
	machine.restore(state);
	wheels.set(keyFor(dimensionId, location), {
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
			const machine = new CrushingWheelMachine(CRUSHING_RECIPES);
			machine.restore(entry.processor);
			wheels.set(keyFor(entry.dimensionId, entry.location), {
				dimensionId: entry.dimensionId,
				location: entry.location,
				machine
			});
		}
	} catch (error) {
		console.warn(`[Create Bedrock] Ignored invalid crushing wheel state: ${error}`);
	}
}

function tryInsertFromPlayer(player, wheel) {
	const inventory = player.getComponent("minecraft:inventory")?.container;
	if (!inventory)
		return false;
	for (let slot = 0; slot < inventory.size; slot++) {
		const stack = inventory.getItem(slot);
		if (!stack)
			continue;
		const started = wheel.machine.tryInsert({ typeId: stack.typeId, count: stack.amount });
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

export function registerCrushingWheels(getKineticWorld) {
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
	world.afterEvents.playerInteractWithBlock.subscribe(event => {
		if (event.block.typeId === CRUSHING_WHEEL_BLOCK && tryInsertFromPlayer(event.player, ensureWheel(event.block)))
			persist();
	});
	registerTickHandler(() => {
		for (const wheel of wheels.values()) {
			const update = wheel.machine.tick(getKineticWorld().speedAt(wheel.dimensionId, wheel.location));
			if (!update?.completed)
				continue;
			const dimension = world.getDimension(wheel.dimensionId);
			for (const output of update.outputs)
				dimension.spawnItem(new ItemStack(output.typeId, output.count), {
					x: wheel.location.x + 0.5,
					y: wheel.location.y + 1,
					z: wheel.location.z + 0.5
				});
			persist();
		}
	});
	system.run(restore);
}
