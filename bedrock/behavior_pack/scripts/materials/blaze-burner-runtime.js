import { ItemStack, system, world } from "@minecraft/server";

import { DeferredPersistence } from "../kernel/deferred-persistence.js";
import { registerTickHandler } from "../kernel/index.js";
import { ShardedStateStore } from "../kernel/sharded-state-store.js";
import { createWorldDynamicPropertyStorage } from "../kernel/world-dynamic-property-storage.js";
import {
	BLAZE_BURNER_BLOCK,
	BURNER_HEAT,
	EMPTY_BLAZE_BURNER,
	fuelForItem,
	heatForFuel,
	insertBurnerFuel,
	LIT_BLAZE_BURNER_BLOCK,
	tickBurnerFuel
} from "./blaze-burner.js";

const HEAT_STATE = "createbedrock:heat_level";
const FLAME_STATE = "createbedrock:flame_type";
const records = new Map();
let failedUpdates = 0;
let registered = false;
let captures = 0;
let fuelInsertions = 0;

function keyFor(dimensionId, location) {
	return `${dimensionId}:${location.x}:${location.y}:${location.z}`;
}

function locationFor(key) {
	const [, x, y, z] = key.split(":");
	return { x: Number(x), y: Number(y), z: Number(z) };
}

function snapshot() {
	return [...records.entries()].map(([id, record]) => ({ id, ...record })).sort((left, right) => left.id.localeCompare(right.id));
}

const state = new ShardedStateStore({
	keyPrefix: "createbedrock:blaze_burner_state_v1",
	onError(error) { console.warn(`[Create Bedrock] Blaze Burner persistence error: ${error}`); },
	partitionFor(record) {
		if (!record?.dimensionId || !record?.location)
			throw new TypeError("Blaze Burner records require a dimension and location");
		return `${record.dimensionId}:${Math.floor(record.location.x / 16)}:${Math.floor(record.location.y / 16)}:${Math.floor(record.location.z / 16)}`;
	},
	storage: createWorldDynamicPropertyStorage(world)
});

const persistence = new DeferredPersistence({
	name: "blaze_burner",
	write() { state.request(snapshot()); },
	onError(error) { console.warn(`[Create Bedrock] Could not persist Blaze Burner state: ${error}`); }
});

function persist() {
	persistence.request();
}

function isBurner(block) {
	return block?.typeId === BLAZE_BURNER_BLOCK;
}

function setStates(block, values) {
	if (!block?.setPermutation)
		return false;
	let permutation = block.permutation;
	let changed = false;
	for (const [stateName, value] of Object.entries(values)) {
		if (permutation.getAllStates?.()[stateName] === value)
			continue;
		permutation = permutation.withState(stateName, value);
		changed = true;
	}
	if (changed)
		block.setPermutation(permutation);
	return changed;
}

function recordFor(block) {
	return records.get(keyFor(block.dimension.id, block.location));
}

function applyHeat(block, record) {
	return setStates(block, { [HEAT_STATE]: heatForFuel(record) });
}

function consumeSelectedItem(player) {
	if (player.getGameMode?.() === "creative")
		return true;
	const inventory = player.getComponent("minecraft:inventory")?.container;
	const slot = player.selectedSlotIndex;
	const stack = inventory?.getItem(slot);
	if (!stack || stack.amount < 1)
		return false;
	if (stack.amount === 1)
		inventory.setItem(slot);
	else {
		const remainder = stack.clone();
		remainder.amount--;
		inventory.setItem(slot, remainder);
	}
	return true;
}

function giveCapturedBurner(player) {
	const inventory = player.getComponent("minecraft:inventory")?.container;
	if (!inventory)
		return false;
	const remainder = inventory.addItem(new ItemStack(BLAZE_BURNER_BLOCK, 1));
	if (remainder)
		player.dimension.spawnItem(remainder, player.location);
	return true;
}

export function insertFuel(block, itemTypeId) {
	if (!isBurner(block))
		return false;
	const offered = fuelForItem(itemTypeId);
	const update = insertBurnerFuel(recordFor(block), offered);
	if (!update.accepted)
		return false;
	const id = keyFor(block.dimension.id, block.location);
	records.set(id, {
		dimensionId: block.dimension.id,
		location: { ...block.location },
		fuel: update.record.fuel,
		remaining: update.record.remaining
	});
	applyHeat(block, update.record);
	persist();
	fuelInsertions++;
	return true;
}

export function blazeHeatAt(dimensionId, location) {
	return heatForFuel(records.get(keyFor(dimensionId, location)));
}

function tickBurners() {
	let changed = false;
	for (const [id, record] of records) {
		try {
			const dimension = world.getDimension(record.dimensionId);
			const block = dimension.getBlock(record.location);
			if (!isBurner(block)) {
				records.delete(id);
				changed = true;
				continue;
			}
			const next = tickBurnerFuel(record);
			if (!next) {
				records.delete(id);
				setStates(block, { [HEAT_STATE]: BURNER_HEAT.NONE });
				changed = true;
				continue;
			}
			records.set(id, { ...record, ...next });
			applyHeat(block, next);
			changed = true;
		} catch {
			failedUpdates++;
		}
	}
	if (changed)
		persist();
}

function heldType(event) {
	return event.itemStack?.typeId;
}

function extinguishLitBurner(event) {
	if (event.block?.typeId !== LIT_BLAZE_BURNER_BLOCK)
		return false;
	const held = heldType(event);
	if (held === "minecraft:soul_sand" || held === "minecraft:soul_soil")
		return setStates(event.block, { [FLAME_STATE]: "soul" });
	if (held?.endsWith("_shovel")) {
		event.block.setType(BLAZE_BURNER_BLOCK);
		return true;
	}
	return false;
}

function interactBurner(event) {
	const block = event.block;
	if (extinguishLitBurner(event))
		return;
	if (!isBurner(block))
		return;
	const held = heldType(event);
	if (held === "minecraft:flint_and_steel" && recordFor(block) === undefined) {
		block.setType(LIT_BLAZE_BURNER_BLOCK);
		return;
	}
	if (insertFuel(block, held))
		consumeSelectedItem(event.player);
}

function captureBlaze(event) {
	if (event.target?.typeId !== "minecraft:blaze" || heldType(event) !== EMPTY_BLAZE_BURNER)
		return;
	try {
		if (!consumeSelectedItem(event.player) || !giveCapturedBurner(event.player))
			return;
		event.target.remove();
		captures++;
	} catch {
		failedUpdates++;
	}
}

function restore() {
	try {
		const restored = state.read();
		for (const record of restored?.records ?? []) {
			if (!record?.id || !record?.dimensionId || !record?.location || !["normal", "special", "creative"].includes(record.fuel))
				continue;
			records.set(record.id, { dimensionId: record.dimensionId, location: record.location, fuel: record.fuel, remaining: record.remaining ?? 0 });
		}
	} catch {
		failedUpdates++;
	}
}

export function getBlazeBurnerDiagnostics() {
	return { captures, failedUpdates, fuelInsertions, persistentBurners: records.size, state: state.diagnostics() };
}

export function registerBlazeBurners() {
	if (registered)
		return false;
	registered = true;
	world.afterEvents.playerInteractWithBlock.subscribe(event => {
		try { interactBurner(event); } catch { failedUpdates++; }
	});
	world.afterEvents.playerInteractWithEntity.subscribe(captureBlaze);
	world.afterEvents.playerPlaceBlock.subscribe(event => {
		try {
			if (isBurner(event.block) && event.itemStack?.typeId === BLAZE_BURNER_BLOCK)
				setStates(event.block, { [HEAT_STATE]: BURNER_HEAT.SMOULDERING });
		} catch { failedUpdates++; }
	});
	world.afterEvents.playerBreakBlock.subscribe(event => {
		const id = keyFor(event.dimension.id, event.block.location);
		if (records.delete(id))
			persist();
	});
	registerTickHandler(() => {
		tickBurners();
		persistence.tick();
		state.tick();
	});
	system.run(restore);
	return true;
}
