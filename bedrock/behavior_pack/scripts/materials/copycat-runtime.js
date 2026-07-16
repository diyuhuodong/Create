import { BlockTypes, ItemStack, system, world } from "@minecraft/server";

import { registerMovingBlockDataContributor } from "../contraptions/moving-block-data.js";
import { registerTickHandler } from "../kernel/index.js";
import { ShardedStateStore } from "../kernel/sharded-state-store.js";
import { createWorldDynamicPropertyStorage } from "../kernel/world-dynamic-property-storage.js";
import {
	COPYCAT_BLOCKS,
	COPYCAT_EMPTY_MATERIAL,
	applyCopycatMaterial,
	clearCopycatMaterial,
	createCopycatState,
	isCopycatBlock,
	validateCopycatState
} from "./copycat.js";

const HAS_MATERIAL_STATE = "createbedrock:has_material";
const MATERIAL_ROTATION_STATE = "createbedrock:material_rotation";
const records = new Map();
let failedUpdates = 0;
let registered = false;

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function assertLocation(location) {
	if (![location?.x, location?.y, location?.z].every(Number.isInteger))
		throw new TypeError("Copycat locations require integer block coordinates");
	return { x: location.x, y: location.y, z: location.z };
}

function recordId(dimensionId, location) {
	if (typeof dimensionId !== "string" || dimensionId.length === 0)
		throw new TypeError("Copycat records require a dimension identifier");
	const normalized = assertLocation(location);
	return `copycat:${dimensionId}:${normalized.x}:${normalized.y}:${normalized.z}`;
}

function partitionFor(record) {
	return `${record.dimensionId}:${Math.floor(record.location.x / 16)}:${Math.floor(record.location.y / 16)}:${Math.floor(record.location.z / 16)}`;
}

const store = new ShardedStateStore({
	keyPrefix: "createbedrock:copycat_state_v1",
	onError(error) {
		console.warn(`[Create Bedrock] Copycat state error: ${error}`);
	},
	partitionFor(record) {
		if (record?.kind !== "copycat")
			throw new TypeError("Unknown Copycat persistent record");
		return partitionFor(record);
	},
	storage: createWorldDynamicPropertyStorage(world)
});

function persistentRecords() {
	return [...records.values()].map(record => ({
		kind: "copycat",
		id: record.id,
		dimensionId: record.dimensionId,
		location: clone(record.location),
		state: clone(record.state),
		typeId: record.typeId
	})).sort((left, right) => left.id.localeCompare(right.id));
}

function persist() {
	try {
		store.request(persistentRecords());
	} catch (error) {
		failedUpdates++;
		console.warn(`[Create Bedrock] Could not persist Copycat state: ${error}`);
	}
}

function resolveBlock(record) {
	try {
		return world.getDimension(record.dimensionId).getBlock(record.location);
	} catch {
		return undefined;
	}
}

function applyStateToBlock(record, block = resolveBlock(record)) {
	if (!isCopycatBlock(block?.typeId) || typeof block.setPermutation !== "function")
		return false;
	let permutation = block.permutation;
	let changed = false;
	const states = permutation.getAllStates?.() ?? {};
	for (const [name, value] of Object.entries({
		[HAS_MATERIAL_STATE]: record.state.materialItemType === COPYCAT_EMPTY_MATERIAL ? 0 : 1,
		[MATERIAL_ROTATION_STATE]: record.state.rotation
	})) {
		if (states[name] === value)
			continue;
		permutation = permutation.withState(name, value);
		changed = true;
	}
	if (changed)
		block.setPermutation(permutation);
	return changed;
}

function createRecord(block) {
	if (!isCopycatBlock(block?.typeId))
		return undefined;
	const location = assertLocation(block.location);
	const id = recordId(block.dimension.id, location);
	const existing = records.get(id);
	if (existing)
		return existing;
	const record = { dimensionId: block.dimension.id, id, location, state: createCopycatState(), typeId: block.typeId };
	records.set(id, record);
	applyStateToBlock(record, block);
	return record;
}

function selectedItemHolder(player) {
	const container = player?.getComponent?.("minecraft:inventory")?.container;
	const slot = player?.selectedSlotIndex;
	if (!container || !Number.isInteger(slot) || slot < 0 || slot >= container.size)
		return undefined;
	const itemStack = container.getItem(slot);
	return {
		itemStack,
		setItem(item) { container.setItem(slot, item); }
	};
}

function isCreative(player) {
	return player?.getGameMode?.() === "creative";
}

function isValidCopycatMaterial(typeId) {
	if (typeof typeId !== "string" || typeId === COPYCAT_EMPTY_MATERIAL || typeId.startsWith("createbedrock:copycat_"))
		return false;
	try {
		return !!BlockTypes.get(typeId);
	} catch {
		return false;
	}
}

function consumeHeldMaterial(player, expectedTypeId) {
	if (isCreative(player))
		return true;
	const holder = selectedItemHolder(player);
	if (!holder?.itemStack || holder.itemStack.typeId !== expectedTypeId || holder.itemStack.amount < 1)
		return false;
	if (holder.itemStack.amount === 1)
		holder.setItem(undefined);
	else {
		const remainder = holder.itemStack.clone();
		remainder.amount--;
		holder.setItem(remainder);
	}
	return true;
}

function returnMaterial(block, materialItemType) {
	if (!block || materialItemType === COPYCAT_EMPTY_MATERIAL)
		return false;
	block.dimension.spawnItem(new ItemStack(materialItemType, 1), block.location);
	return true;
}

function applyMaterial(record, block, player, itemTypeId) {
	if (!isValidCopycatMaterial(itemTypeId))
		return false;
	const result = applyCopycatMaterial(record.state, itemTypeId);
	if (!result.changed) {
		if (result.reason === "occupied")
			player.sendMessage?.("Copycat already has a material. Sneak-interact empty-handed to reset it.");
		return false;
	}
	if (result.consumed && !consumeHeldMaterial(player, itemTypeId))
		return false;
	record.state = result.state;
	applyStateToBlock(record, block);
	persist();
	player.sendMessage?.(result.reason === "rotated"
		? "Copycat material orientation cycled."
		: `Copycat now contains ${itemTypeId}.`);
	return true;
}

function resetMaterial(record, block, player) {
	const result = clearCopycatMaterial(record.state);
	if (!result.changed)
		return false;
	record.state = result.state;
	if (!isCreative(player))
		returnMaterial(block, result.materialItemType);
	applyStateToBlock(record, block);
	persist();
	player.sendMessage?.("Copycat material returned.");
	return true;
}

export function captureCopycatMovingData(dimensionId, location) {
	const record = records.get(recordId(dimensionId, location));
	return record && { state: clone(record.state), typeId: record.typeId };
}

export function detachCopycatMovingData(dimensionId, location) {
	if (!records.delete(recordId(dimensionId, location)))
		return false;
	persist();
	return true;
}

export function restoreCopycatMovingData(dimensionId, location, data) {
	if (data === undefined)
		return false;
	if (!isCopycatBlock(data.typeId))
		throw new TypeError("Moving Copycat data has an invalid block type");
	const id = recordId(dimensionId, location);
	if (records.has(id))
		throw new Error(`Cannot restore Copycat state over an existing record: ${id}`);
	const record = { dimensionId, id, location: assertLocation(location), state: validateCopycatState(data.state), typeId: data.typeId };
	records.set(id, record);
	applyStateToBlock(record);
	persist();
	return true;
}

export function getCopycatDiagnostics() {
	return { active: records.size, failedUpdates, persistence: store.diagnostics() };
}

function restore() {
	try {
		const restored = store.read();
		if (!restored)
			return;
		for (const warning of restored.warnings)
			console.warn(`[Create Bedrock] Ignored Copycat state shard ${warning.partition}: ${warning.error}`);
		for (const entry of restored.records) {
			if (entry?.kind !== "copycat" || typeof entry.dimensionId !== "string" || !isCopycatBlock(entry.typeId))
				throw new Error("Copycat state contains an invalid record");
			const location = assertLocation(entry.location);
			const id = recordId(entry.dimensionId, location);
			if (entry.id !== id)
				throw new Error("Copycat state has an invalid identity");
			records.set(id, { dimensionId: entry.dimensionId, id, location, state: validateCopycatState(entry.state), typeId: entry.typeId });
		}
		for (const record of records.values())
			applyStateToBlock(record);
	} catch (error) {
		failedUpdates++;
		console.warn(`[Create Bedrock] Could not restore Copycat state: ${error}`);
	}
}

export function registerCopycats() {
	if (registered)
		return false;
	registered = true;
	for (const typeId of COPYCAT_BLOCKS) {
		registerMovingBlockDataContributor(typeId, "copycat", {
			capture: captureCopycatMovingData,
			detach: detachCopycatMovingData,
			restore: restoreCopycatMovingData,
			schemaVersion: 1,
			validate(data) {
				if (!data || !isCopycatBlock(data.typeId))
					throw new TypeError("Moving Copycat data must retain its block type");
				validateCopycatState(data.state);
			}
		});
	}
	world.afterEvents.playerPlaceBlock.subscribe(event => {
		try {
			if (createRecord(event.block))
				persist();
		} catch (error) {
			failedUpdates++;
			console.warn(`[Create Bedrock] Could not place Copycat: ${error}`);
		}
	});
	world.afterEvents.playerBreakBlock.subscribe(event => {
		try {
			const id = recordId(event.dimension.id, event.block.location);
			const record = records.get(id);
			if (!record)
				return;
			records.delete(id);
			if (!isCreative(event.player))
				returnMaterial(event.block, record.state.materialItemType);
			persist();
		} catch (error) {
			failedUpdates++;
			console.warn(`[Create Bedrock] Could not remove Copycat: ${error}`);
		}
	});
	world.afterEvents.playerInteractWithBlock.subscribe(event => {
		try {
			const record = createRecord(event.block);
			if (!record)
				return;
			const itemTypeId = event.itemStack?.typeId;
			if ((!itemTypeId || itemTypeId === COPYCAT_EMPTY_MATERIAL) && event.player?.isSneaking) {
				resetMaterial(record, event.block, event.player);
				return;
			}
			if (itemTypeId)
				applyMaterial(record, event.block, event.player, itemTypeId);
		} catch (error) {
			failedUpdates++;
			event.player?.sendMessage?.(`Could not use Copycat: ${error}`);
		}
	});
	registerTickHandler(() => store.tick());
	system.run(restore);
	return true;
}
