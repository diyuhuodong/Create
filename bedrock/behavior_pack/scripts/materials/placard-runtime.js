import { ItemStack, system, world } from "@minecraft/server";

import { registerMovingBlockDataContributor } from "../contraptions/moving-block-data.js";
import { registerTickHandler } from "../kernel/index.js";
import { ShardedStateStore } from "../kernel/sharded-state-store.js";
import { createWorldDynamicPropertyStorage } from "../kernel/world-dynamic-property-storage.js";
import {
	PLACARD_BLOCK,
	createPlacardState,
	insertPlacardItem,
	placardHasItem,
	placardPowered,
	removePlacardItem,
	tickPlacard,
	triggerPlacard,
	validatePlacardState
} from "./placard.js";

const HAS_ITEM_STATE = "createbedrock:has_item";
const POWERED_STATE = "createbedrock:powered";
const records = new Map();
let failedUpdates = 0;
let registered = false;

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function assertLocation(location) {
	if (!location || !Number.isInteger(location.x) || !Number.isInteger(location.y) || !Number.isInteger(location.z))
		throw new TypeError("Placard locations require integer coordinates");
	return { x: location.x, y: location.y, z: location.z };
}

function recordId(dimensionId, location) {
	if (typeof dimensionId !== "string" || dimensionId.length === 0)
		throw new TypeError("Placards require a dimension identifier");
	const normalized = assertLocation(location);
	return `placard:${dimensionId}:${normalized.x}:${normalized.y}:${normalized.z}`;
}

function partitionFor(record) {
	const location = record.location;
	return `${record.dimensionId}:${Math.floor(location.x / 16)}:${Math.floor(location.y / 16)}:${Math.floor(location.z / 16)}`;
}

const store = new ShardedStateStore({
	keyPrefix: "createbedrock:placard_state_v1",
	onError(error) {
		console.warn(`[Create Bedrock] Placard state error: ${error}`);
	},
	partitionFor(record) {
		if (record?.kind !== "placard")
			throw new TypeError("Unknown Placard persistent record");
		return partitionFor(record);
	},
	storage: createWorldDynamicPropertyStorage(world)
});

function persistentRecords() {
	return [...records.values()].map(record => ({
		kind: "placard",
		id: record.id,
		dimensionId: record.dimensionId,
		location: clone(record.location),
		state: clone(record.state)
	})).sort((left, right) => left.id.localeCompare(right.id));
}

function persist() {
	try {
		store.request(persistentRecords());
	} catch (error) {
		failedUpdates++;
		console.warn(`[Create Bedrock] Could not persist Placards: ${error}`);
	}
}

function isPlacard(block) {
	return block?.typeId === PLACARD_BLOCK;
}

function resolveBlock(record) {
	try {
		return world.getDimension(record.dimensionId).getBlock(record.location);
	} catch {
		return undefined;
	}
}

function applyStateToBlock(record, block = resolveBlock(record)) {
	if (!isPlacard(block) || typeof block.setPermutation !== "function")
		return false;
	let permutation = block.permutation;
	let changed = false;
	for (const [name, value] of Object.entries({
		[HAS_ITEM_STATE]: placardHasItem(record.state) ? 1 : 0,
		[POWERED_STATE]: placardPowered(record.state) ? 1 : 0
	})) {
		if (permutation.getAllStates?.()[name] === value)
			continue;
		permutation = permutation.withState(name, value);
		changed = true;
	}
	if (changed)
		block.setPermutation(permutation);
	return changed;
}

function createRecord(block) {
	if (!isPlacard(block))
		return undefined;
	const location = assertLocation(block.location);
	const id = recordId(block.dimension.id, location);
	const existing = records.get(id);
	if (existing)
		return existing;
	const record = { dimensionId: block.dimension.id, id, location, state: createPlacardState() };
	records.set(id, record);
	applyStateToBlock(record, block);
	return record;
}

function setHeldInventoryItem(player, expectedTypeId, amount) {
	const container = player?.getComponent?.("minecraft:inventory")?.container;
	const slot = player?.selectedSlotIndex;
	if (!container || !Number.isInteger(slot) || slot < 0)
		return false;
	const current = container.getItem(slot);
	if (!current || current.typeId !== expectedTypeId || current.amount < amount)
		return false;
	container.setItem(slot, current.amount === amount ? undefined : new ItemStack(expectedTypeId, current.amount - amount));
	return true;
}

function returnItem(block, itemTypeId) {
	if (!block || !itemTypeId || itemTypeId === "minecraft:air")
		return false;
	block.dimension.spawnItem(new ItemStack(itemTypeId, 1), block.location);
	return true;
}

function insertItem(record, block, player, itemTypeId) {
	const result = insertPlacardItem(record.state, itemTypeId);
	if (!result.changed)
		return false;
	if (!setHeldInventoryItem(player, itemTypeId, 1))
		return false;
	record.state = result.state;
	applyStateToBlock(record, block);
	persist();
	return true;
}

function removeItem(record, block) {
	const result = removePlacardItem(record.state);
	if (!result.changed)
		return false;
	record.state = result.state;
	applyStateToBlock(record, block);
	returnItem(block, result.itemTypeId);
	persist();
	return true;
}

function trigger(record, block, itemTypeId) {
	const result = triggerPlacard(record.state, itemTypeId);
	if (!result.changed)
		return false;
	record.state = result.state;
	applyStateToBlock(record, block);
	persist();
	return true;
}

export function capturePlacardMovingData(dimensionId, location) {
	const record = records.get(recordId(dimensionId, location));
	return record && { state: clone(record.state) };
}

export function detachPlacardMovingData(dimensionId, location) {
	if (!records.delete(recordId(dimensionId, location)))
		return false;
	persist();
	return true;
}

export function restorePlacardMovingData(dimensionId, location, data) {
	if (data === undefined)
		return false;
	const id = recordId(dimensionId, location);
	if (records.has(id))
		throw new Error(`Cannot restore Placard state over an existing record: ${id}`);
	const record = { dimensionId, id, location: assertLocation(location), state: validatePlacardState(data.state) };
	records.set(id, record);
	applyStateToBlock(record);
	persist();
	return true;
}

export function getPlacardDiagnostics() {
	return { active: records.size, failedUpdates, persistence: store.diagnostics() };
}

function restore() {
	try {
		const restored = store.read();
		if (!restored)
			return;
		for (const warning of restored.warnings)
			console.warn(`[Create Bedrock] Ignored Placard state shard ${warning.partition}: ${warning.error}`);
		for (const entry of restored.records) {
			if (entry?.kind !== "placard" || typeof entry.dimensionId !== "string")
				throw new Error("Placard state contains an unknown record");
			const location = assertLocation(entry.location);
			const id = recordId(entry.dimensionId, location);
			if (entry.id !== id)
				throw new Error("Placard state has an invalid identity");
			records.set(id, { dimensionId: entry.dimensionId, id, location, state: validatePlacardState(entry.state) });
		}
		for (const record of records.values())
			applyStateToBlock(record);
	} catch (error) {
		failedUpdates++;
		console.warn(`[Create Bedrock] Could not restore Placard state: ${error}`);
	}
}

export function registerPlacards() {
	if (registered)
		return false;
	registered = true;
	registerMovingBlockDataContributor(PLACARD_BLOCK, "placard", {
		capture: capturePlacardMovingData,
		detach: detachPlacardMovingData,
		restore: restorePlacardMovingData,
		schemaVersion: 1,
		validate(data) {
			if (!data || typeof data !== "object")
				throw new TypeError("Moving Placard data must contain its persistent state");
			validatePlacardState(data.state);
		}
	});
	world.afterEvents.playerPlaceBlock.subscribe(event => {
		try {
			if (createRecord(event.block))
				persist();
		} catch (error) {
			failedUpdates++;
			console.warn(`[Create Bedrock] Could not place Placard: ${error}`);
		}
	});
	world.afterEvents.playerBreakBlock.subscribe(event => {
		try {
			const id = recordId(event.dimension.id, event.block.location);
			const record = records.get(id);
			if (!record)
				return;
			records.delete(id);
			if (record.state.heldItem !== "minecraft:air")
				event.dimension.spawnItem(new ItemStack(record.state.heldItem, 1), event.block.location);
			persist();
		} catch (error) {
			failedUpdates++;
			console.warn(`[Create Bedrock] Could not remove Placard: ${error}`);
		}
	});
	world.afterEvents.playerInteractWithBlock.subscribe(event => {
		try {
			const record = createRecord(event.block);
			if (!record)
				return;
			const itemTypeId = event.itemStack?.typeId;
			if (!itemTypeId || itemTypeId === "minecraft:air") {
				if (event.player?.isSneaking)
					removeItem(record, event.block);
				return;
			}
			if (record.state.heldItem === "minecraft:air") {
				if (insertItem(record, event.block, event.player, itemTypeId))
					event.player.sendMessage?.(`Placard now holds ${itemTypeId}. Sneak-interact empty-handed to remove it.`);
				return;
			}
			trigger(record, event.block, itemTypeId);
		} catch (error) {
			failedUpdates++;
			event.player?.sendMessage?.(`Could not use Placard: ${error}`);
		}
	});
	registerTickHandler(() => {
		let changed = false;
		for (const record of records.values()) {
			const next = tickPlacard(record.state);
			if (JSON.stringify(next) === JSON.stringify(record.state))
				continue;
			record.state = next;
			applyStateToBlock(record);
			changed = true;
		}
		if (changed)
			persist();
		return store.tick() || changed;
	});
	system.run(restore);
	return true;
}
