import { world } from "@minecraft/server";

import { registerTickHandler } from "../kernel/index.js";
import { ShardedStateStore } from "../kernel/sharded-state-store.js";
import { createWorldDynamicPropertyStorage } from "../kernel/world-dynamic-property-storage.js";
import { registerAssemblyAttachmentProvider } from "./assembly-attachments.js";
import { isMovableBlockType } from "./movable-blocks.js";
import { registerMovingBlockDataContributor } from "./moving-block-data.js";
import { createStickerState, normalizeStickerRecord, stickerAttachmentTarget } from "./sticker-state.js";

export const STICKER_BLOCK = "createbedrock:sticker";

const ACTIVE_STATE = "createbedrock:active";
const FACING_STATE = "minecraft:facing_direction";
const records = new Map();
let failedUpdates = 0;
let registered = false;

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function locationKey(location) { return `${location.x}:${location.y}:${location.z}`; }
function recordId(dimensionId, location) { return `sticker:${dimensionId}:${locationKey(location)}`; }

const store = new ShardedStateStore({
	keyPrefix: "createbedrock:sticker_state_v1",
	onError(error) { console.warn(`[Create Bedrock] Sticker state error: ${error}`); },
	partitionFor(record) {
		if (record?.kind !== "sticker")
			throw new TypeError("Unknown Sticker persistent record");
		return `${record.dimensionId}:${Math.floor(record.location.x / 16)}:${Math.floor(record.location.y / 16)}:${Math.floor(record.location.z / 16)}`;
	},
	storage: createWorldDynamicPropertyStorage(world)
});

function persistentRecords() {
	return [...records.values()].map(record => ({ ...clone(record), kind: "sticker" })).sort((left, right) => left.id.localeCompare(right.id));
}

function persist() {
	try { store.request(persistentRecords()); } catch (error) {
		failedUpdates++;
		console.warn(`[Create Bedrock] Could not persist Sticker state: ${error}`);
	}
}

function statesFor(block) { return block?.permutation?.getAllStates?.() ?? {}; }

function stateForBlock(block) {
	const states = statesFor(block);
	return createStickerState({ active: states[ACTIVE_STATE], facing: states[FACING_STATE] ?? 1 });
}

function recordFor(dimensionId, location) {
	return records.get(recordId(dimensionId, location));
}

function writeRecord(dimensionId, location, state, { persistState = true } = {}) {
	const record = normalizeStickerRecord({ dimensionId, location, state });
	records.set(record.id, record);
	if (persistState)
		persist();
	return record;
}

function ensureRecord(block) {
	if (block?.typeId !== STICKER_BLOCK)
		return undefined;
	return recordFor(block.dimension.id, block.location) ?? writeRecord(block.dimension.id, block.location, stateForBlock(block));
}

function removeRecord(dimensionId, location) {
	if (!records.delete(recordId(dimensionId, location)))
		return false;
	persist();
	return true;
}

function dimensionBlock(dimensionId, location) {
	try { return world.getDimension(dimensionId).getBlock(location); } catch { return undefined; }
}

function setActive(block, active) {
	if (block?.typeId !== STICKER_BLOCK || typeof block.setPermutation !== "function")
		return false;
	const state = createStickerState({ ...stateForBlock(block), active });
	const target = stickerAttachmentTarget(block.location, state);
	if (target && !isMovableBlockType(dimensionBlock(block.dimension.id, target)?.typeId))
		throw new Error("Sticker requires a movable Create block directly in front of it");
	block.setPermutation(block.permutation.withState(ACTIVE_STATE, state.active ? 1 : 0));
	writeRecord(block.dimension.id, block.location, state);
	return true;
}

function captureStickerMovingData(dimensionId, location) {
	const record = recordFor(dimensionId, location);
	if (record)
		return { state: clone(record.state) };
	const block = dimensionBlock(dimensionId, location);
	return block?.typeId === STICKER_BLOCK ? { state: stateForBlock(block) } : undefined;
}

function detachStickerMovingData(dimensionId, location) {
	removeRecord(dimensionId, location);
}

function restoreStickerMovingData(dimensionId, location, payload) {
	const state = createStickerState(payload?.state);
	writeRecord(dimensionId, location, state);
}

/** Return a single active Sticker edge. Source ownership conflicts are then
 * rejected atomically by DynamicAssemblyController when it claims the full
 * collected source set. */
export function stickerLinkedLocationsForAssembly(dimensionId, location) {
	const block = dimensionBlock(dimensionId, location);
	const record = recordFor(dimensionId, location) ?? ensureRecord(block);
	if (!record)
		return [];
	const target = stickerAttachmentTarget(location, record.state);
	return target && isMovableBlockType(dimensionBlock(dimensionId, target)?.typeId) ? [target] : [];
}

function restore() {
	try {
		const restored = store.read();
		if (!restored)
			return;
		for (const warning of restored.warnings)
			console.warn(`[Create Bedrock] Ignored Sticker state shard ${warning.partition}: ${warning.error}`);
		for (const entry of restored.records) {
			if (entry?.kind !== "sticker")
				throw new Error("Sticker state contains an unknown record");
			const record = normalizeStickerRecord(entry);
			records.set(record.id, record);
		}
	} catch (error) {
		failedUpdates++;
		console.warn(`[Create Bedrock] Could not restore Sticker state: ${error}`);
	}
}

export function getStickerDiagnostics() {
	return { active: [...records.values()].filter(record => record.state.active).length, failedUpdates, records: records.size, persistence: store.diagnostics() };
}

export function registerStickers() {
	if (registered)
		return false;
	registered = true;
	registerAssemblyAttachmentProvider("sticker", stickerLinkedLocationsForAssembly);
	registerMovingBlockDataContributor(STICKER_BLOCK, "sticker", {
		capture: captureStickerMovingData,
		detach: detachStickerMovingData,
		restore: restoreStickerMovingData,
		schemaVersion: 1,
		validate(payload) { createStickerState(payload?.state); }
	});
	world.afterEvents.playerPlaceBlock.subscribe(event => {
		if (event.block?.typeId === STICKER_BLOCK)
			ensureRecord(event.block);
	});
	world.afterEvents.playerBreakBlock.subscribe(event => {
		if (event.block?.typeId === STICKER_BLOCK)
			removeRecord(event.dimension.id, event.block.location);
	});
	world.afterEvents.playerInteractWithBlock.subscribe(event => {
		if (event.block?.typeId !== STICKER_BLOCK || event.itemStack)
			return;
		try {
			const state = stateForBlock(event.block);
			if (setActive(event.block, !state.active))
				event.player.sendMessage?.(state.active ? "Sticker released." : "Sticker attached.");
		} catch (error) {
			failedUpdates++;
			event.player.sendMessage?.(`Sticker attachment rejected: ${error}`);
		}
	});
	registerTickHandler(() => store.tick());
	restore();
	return true;
}
