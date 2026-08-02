import { world } from "@minecraft/server";

import { registerTickHandler } from "../kernel/index.js";
import { ShardedStateStore } from "../kernel/sharded-state-store.js";
import { createWorldDynamicPropertyStorage } from "../kernel/world-dynamic-property-storage.js";
import { registerAssemblyAttachmentProvider } from "./assembly-attachments.js";
import { isMovableBlockType } from "./movable-blocks.js";
import {
	glueBoundsFromPoints,
	glueContains,
	glueLocations,
	glueRecordId,
	SUPER_GLUE_ENTITY,
	SUPER_GLUE_ITEM,
	transformGlueBounds,
	validateGlueSelection
} from "./super-glue.js";

const MARKER_ID_PROPERTY = "createbedrock:super_glue_id";
const records = new Map();
const selections = new Map();
let failedUpdates = 0;
let registered = false;

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function locationKey(location) { return `${location.x}:${location.y}:${location.z}`; }

function partitionFor(record) {
	return `${record.dimensionId}:${Math.floor(record.bounds.min.x / 16)}:${Math.floor(record.bounds.min.y / 16)}:${Math.floor(record.bounds.min.z / 16)}`;
}

const store = new ShardedStateStore({
	keyPrefix: "createbedrock:super_glue_state_v1",
	onError(error) { console.warn(`[Create Bedrock] Super Glue state error: ${error}`); },
	partitionFor(record) {
		if (record?.kind !== "super_glue")
			throw new TypeError("Unknown Super Glue persistent record");
		return partitionFor(record);
	},
	storage: createWorldDynamicPropertyStorage(world)
});

function persistentRecords() {
	return [...records.values()].map(record => ({
		bounds: clone(record.bounds), dimensionId: record.dimensionId, id: record.id, kind: "super_glue"
	})).sort((left, right) => left.id.localeCompare(right.id));
}

function persist() {
	try { store.request(persistentRecords()); } catch (error) {
		failedUpdates++;
		console.warn(`[Create Bedrock] Could not persist Super Glue: ${error}`);
	}
}

function dimensionFor(record) {
	try { return world.getDimension(record.dimensionId); } catch { return undefined; }
}

function markerFor(record) {
	const dimension = dimensionFor(record);
	if (!dimension)
		return undefined;
	return dimension.getEntities({ type: SUPER_GLUE_ENTITY })
		.find(entity => entity.getDynamicProperty(MARKER_ID_PROPERTY) === record.id);
}

function ensureMarker(record) {
	try {
		const existing = markerFor(record);
		if (existing?.isValid)
			return existing;
		const marker = dimensionFor(record)?.spawnEntity(SUPER_GLUE_ENTITY, {
			x: record.bounds.min.x + .5, y: record.bounds.min.y + .5, z: record.bounds.min.z + .5
		});
		marker?.setDynamicProperty(MARKER_ID_PROPERTY, record.id);
		return marker;
	} catch (error) {
		failedUpdates++;
		console.warn(`[Create Bedrock] Could not create Super Glue marker ${record.id}: ${error}`);
		return undefined;
	}
}

function removeMarker(record) {
	try { markerFor(record)?.remove(); } catch { failedUpdates++; }
}

function isCreative(player) { return player?.getGameMode?.() === "creative"; }

function selectedGlueSlot(player) {
	const container = player?.getComponent?.("minecraft:inventory")?.container;
	const slot = player?.selectedSlotIndex;
	if (!container || !Number.isInteger(slot) || slot < 0 || slot >= container.size)
		return undefined;
	const itemStack = container.getItem(slot);
	if (itemStack?.typeId !== SUPER_GLUE_ITEM)
		return undefined;
	return { itemStack, setItem(item) { container.setItem(slot, item); } };
}

function consumeGlueCharge(player) {
	if (isCreative(player))
		return true;
	const holder = selectedGlueSlot(player);
	const stack = holder?.itemStack?.clone?.();
	const durability = stack?.getComponent?.("minecraft:durability");
	if (!holder || !stack || !durability)
		return false;
	if (durability.damage + 1 >= durability.maxDurability)
		holder.setItem(undefined);
	else {
		durability.damage++;
		holder.setItem(stack);
	}
	return true;
}

function allSelectionBlocksMovable(dimension, bounds) {
	for (const location of glueLocations(bounds)) {
		const block = dimension.getBlock(location);
		if (!block || !isMovableBlockType(block.typeId))
			return false;
	}
	return true;
}

function createRecord(dimensionId, bounds) {
	const id = glueRecordId(dimensionId, bounds);
	const existing = records.get(id);
	if (existing)
		return { changed: false, record: existing };
	const record = { bounds: clone(bounds), dimensionId, id };
	records.set(id, record);
	ensureMarker(record);
	persist();
	return { changed: true, record };
}

function removeRecord(record) {
	if (!records.delete(record.id))
		return false;
	removeMarker(record);
	persist();
	return true;
}

function findRecordAt(dimensionId, location) {
	return [...records.values()].find(record => record.dimensionId === dimensionId && glueContains(record.bounds, location));
}

function handleGlueUse(player, block) {
	if (!player || !block)
		return false;
	const dimensionId = block.dimension.id;
	if (player.isSneaking) {
		const record = findRecordAt(dimensionId, block.location);
		if (!record)
			return false;
		removeRecord(record);
		player.sendMessage?.("Super Glue removed.");
		return true;
	}
	const pending = selections.get(player.id);
	if (!pending) {
		if (!isMovableBlockType(block.typeId)) {
			player.sendMessage?.("Super Glue must start on a movable Create block.");
			return false;
		}
		selections.set(player.id, { dimensionId, start: { ...block.location } });
		player.sendMessage?.("First Super Glue corner selected. Use it on the opposite corner to confirm.");
		return true;
	}
	selections.delete(player.id);
	if (pending.dimensionId !== dimensionId) {
		player.sendMessage?.("Super Glue corners must be in the same dimension.");
		return false;
	}
	let bounds;
	try { bounds = validateGlueSelection(pending.start, block.location); } catch (error) {
		player.sendMessage?.(`Super Glue selection rejected: ${error.message}`);
		return false;
	}
	if (!allSelectionBlocksMovable(block.dimension, bounds)) {
		player.sendMessage?.("Super Glue selections must contain only movable blocks; fill the selected box or reduce it.");
		return false;
	}
	if (!consumeGlueCharge(player)) {
		player.sendMessage?.("A usable Super Glue charge is required.");
		return false;
	}
	const result = createRecord(dimensionId, bounds);
	player.sendMessage?.(result.changed ? "Super Glue applied; the selected blocks will assemble together." : "That Super Glue volume already exists.");
	return result.changed;
}

/** Return all locations joined to a selected location by a glue volume. */
export function gluedLocationsForAssembly(dimensionId, location) {
	const key = locationKey(location);
	return [...records.values()]
		.filter(record => record.dimensionId === dimensionId && glueContains(record.bounds, location))
		.flatMap(record => glueLocations(record.bounds))
		.filter(candidate => locationKey(candidate) !== key);
}

/** Capture only full glue volumes. The collector expands every volume first. */
export function captureSuperGlueAssemblyAttachments(dimensionId, locations, anchor) {
	if (!Array.isArray(locations) || !anchor)
		throw new TypeError("Super Glue assembly capture requires locations and anchor");
	const selected = new Set(locations.map(locationKey));
	const attached = [];
	for (const record of records.values()) {
		if (record.dimensionId !== dimensionId)
			continue;
		const volume = glueLocations(record.bounds);
		if (!volume.some(location => selected.has(locationKey(location))))
			continue;
		if (!volume.every(location => selected.has(locationKey(location))))
			throw new Error(`Assembly cannot split Super Glue volume ${record.id}`);
		attached.push({
			id: record.id,
			bounds: {
				min: { x: record.bounds.min.x - anchor.x, y: record.bounds.min.y - anchor.y, z: record.bounds.min.z - anchor.z },
				max: { x: record.bounds.max.x - anchor.x, y: record.bounds.max.y - anchor.y, z: record.bounds.max.z - anchor.z }
			}
		});
	}
	return attached.length === 0 ? undefined : { records: attached, schemaVersion: 1 };
}

export function detachSuperGlueAssemblyAttachments(attachments) {
	if (!attachments || attachments.schemaVersion !== 1 || !Array.isArray(attachments.records))
		return 0;
	let detached = 0;
	for (const attachment of attachments.records) {
		const record = records.get(attachment?.id);
		if (record && removeRecord(record))
			detached++;
	}
	return detached;
}

export function restoreSuperGlueAssemblyAttachments(dimensionId, anchor, attachments, transform) {
	if (!attachments || attachments.schemaVersion !== 1 || !Array.isArray(attachments.records))
		return 0;
	let restored = 0;
	for (const attachment of attachments.records) {
		try {
			const sourceBounds = {
				min: { x: anchor.x + attachment.bounds.min.x, y: anchor.y + attachment.bounds.min.y, z: anchor.z + attachment.bounds.min.z },
				max: { x: anchor.x + attachment.bounds.max.x, y: anchor.y + attachment.bounds.max.y, z: anchor.z + attachment.bounds.max.z }
			};
			const bounds = transformGlueBounds(sourceBounds, anchor, transform);
			if (createRecord(dimensionId, bounds).changed)
				restored++;
		} catch (error) {
			failedUpdates++;
			console.warn(`[Create Bedrock] Could not restore Super Glue assembly attachment: ${error}`);
		}
	}
	return restored;
}

function restore() {
	try {
		const restored = store.read();
		if (!restored)
			return;
		for (const warning of restored.warnings)
			console.warn(`[Create Bedrock] Ignored Super Glue state shard ${warning.partition}: ${warning.error}`);
		for (const entry of restored.records) {
			if (entry?.kind !== "super_glue" || typeof entry.dimensionId !== "string")
				throw new Error("Super Glue state contains an unknown record");
			const bounds = glueBoundsFromPoints(entry.bounds?.min, entry.bounds?.max);
			const id = glueRecordId(entry.dimensionId, bounds);
			if (entry.id !== id)
				throw new Error("Super Glue state has an invalid identity");
			records.set(id, { bounds, dimensionId: entry.dimensionId, id });
		}
	} catch (error) {
		failedUpdates++;
		console.warn(`[Create Bedrock] Could not restore Super Glue state: ${error}`);
	}
}

export function getSuperGlueDiagnostics() {
	return { active: records.size, failedUpdates, pendingSelections: selections.size, persistence: store.diagnostics() };
}

export function registerSuperGlue() {
	if (registered)
		return false;
	registered = true;
	registerAssemblyAttachmentProvider("super_glue", gluedLocationsForAssembly);
	world.afterEvents.itemStartUseOn.subscribe(event => {
		if (event.itemStack?.typeId !== SUPER_GLUE_ITEM)
			return;
		try { handleGlueUse(event.source, event.block); } catch (error) {
			failedUpdates++;
			event.source?.sendMessage?.(`Could not use Super Glue: ${error}`);
		}
	});
	world.afterEvents.playerLeave.subscribe(event => selections.delete(event.playerId));
	registerTickHandler(() => {
		for (const record of records.values())
			ensureMarker(record);
		store.tick();
	});
	restore();
	return true;
}
