import { BlockPermutation, ItemStack, world } from "@minecraft/server";

import { registerTickHandler } from "../kernel/index.js";
import { ShardedStateStore } from "../kernel/sharded-state-store.js";
import { createWorldDynamicPropertyStorage } from "../kernel/world-dynamic-property-storage.js";
import {
	captureSchematicSelection,
	parseSchematicSnapshot,
	SCHEMATIC_PLACEMENT_SCHEMA,
	SchematicPlacementController,
	serializeSchematicSnapshot
} from "./schematic-state.js";

export const CRAFTING_BLUEPRINT_ENTITY = "createbedrock:crafting_blueprint";
export const CRAFTING_BLUEPRINT_ITEM = "createbedrock:crafting_blueprint";
export const EMPTY_SCHEMATIC_ITEM = "createbedrock:empty_schematic";
export const SCHEMATIC_AND_QUILL_ITEM = "createbedrock:schematic_and_quill";
export const SCHEMATIC_ITEM = "createbedrock:schematic";
export const SCHEMATIC_TABLE_BLOCK = "createbedrock:schematic_table";
export const SCHEMATICANNON_BLOCK = "createbedrock:schematicannon";

export const SCHEMATIC_ITEM_STATE_PROPERTY = "createbedrock:schematic_snapshot";
export const SCHEMATIC_SELECTION_PROPERTY = "createbedrock:schematic_selection";

const CANNON_BATCH_SIZE = 32;
const MAX_ACTIVE_CANNONS = 8;
const MAX_PERSISTED_OPERATION_CHARS = 8_192;
const AIR = "minecraft:air";
const tables = new Map();
const cannons = new Map();
let failedOperations = 0;
let nextPlacement = 0;
let registered = false;

function clone(value) {
	return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function locationKey(location) {
	return `${location.x}:${location.y}:${location.z}`;
}

function recordId(kind, dimensionId, location) {
	return `${kind}:${dimensionId}:${locationKey(location)}`;
}

function assertLocation(value, label) {
	if (![value?.x, value?.y, value?.z].every(Number.isInteger))
		throw new TypeError(`${label} must use integer coordinates`);
	return { x: value.x, y: value.y, z: value.z };
}

function isAirlike(typeId) {
	return typeId === undefined || [AIR, "minecraft:cave_air", "minecraft:void_air", "minecraft:water", "minecraft:flowing_water", "minecraft:lava", "minecraft:flowing_lava"].includes(typeId);
}

function worldPort() {
	function block(dimensionId, location) {
		return world.getDimension(dimensionId).getBlock(location);
	}
	return {
		canPlace(dimensionId, location, before) {
			try { return isAirlike(before?.typeId) && !!block(dimensionId, location); } catch { return false; }
		},
		placeBlock(dimensionId, location, value) {
			const target = block(dimensionId, location);
			if (!target)
				throw new Error("Schematic destination is not loaded");
			target.setPermutation(BlockPermutation.resolve(value.typeId, value.states));
		},
		readBlock(dimensionId, location) {
			try {
				const target = block(dimensionId, location);
				return target && { states: target.permutation.getAllStates(), typeId: target.typeId };
			} catch {
				return undefined;
			}
		},
		restoreBlock(dimensionId, location, value) {
			const target = block(dimensionId, location);
			if (!target)
				throw new Error("Schematic rollback destination is not loaded");
			if (value === undefined)
				target.setType(AIR);
			else
				target.setPermutation(BlockPermutation.resolve(value.typeId, value.states));
		}
	};
}

const placements = new SchematicPlacementController(worldPort());

function placementPersistenceRecords(record) {
	const chunks = [];
	let operations = [];
	for (const operation of record.operations) {
		const candidate = [...operations, operation];
		if (JSON.stringify(candidate).length <= MAX_PERSISTED_OPERATION_CHARS) {
			operations = candidate;
			continue;
		}
		if (operations.length === 0)
			throw new RangeError("One Schematic placement operation exceeds the persistence shard budget");
		chunks.push(operations);
		operations = [operation];
	}
	if (operations.length > 0)
		chunks.push(operations);
	const { operations: ignoredOperations, snapshot, ...header } = record;
	return [
		{
			...clone(header),
			kind: "placement_header",
			operationChunks: chunks.length,
			snapshotSerialized: serializeSchematicSnapshot(snapshot)
		},
		...chunks.map((entries, index) => ({
			anchor: clone(record.anchor),
			dimensionId: record.dimensionId,
			id: `placement_chunk:${record.id}:${index}`,
			index,
			kind: "placement_chunk",
			operations: clone(entries),
			placementId: record.id
		}))
	];
}

function tablePersistenceRecord(record) {
	const { snapshot, ...metadata } = record;
	return {
		...clone(metadata),
		...(snapshot === undefined ? {} : { snapshotSerialized: serializeSchematicSnapshot(snapshot) })
	};
}

function persistentRecords() {
	const placementRecords = placements.activeRecords().flatMap(placementPersistenceRecords);
	return [
		...placementRecords,
		...[...tables.values()].map(tablePersistenceRecord),
		...[...cannons.values()].map(clone)
	].sort((left, right) => left.id.localeCompare(right.id));
}

const store = new ShardedStateStore({
	keyPrefix: "createbedrock:schematics_v1",
	onCommit() {
		let changed = false;
		for (const record of cannons.values()) {
			if (record.runState === "awaiting_placement_commit") {
				record.runState = "ready";
				changed = true;
			} else if (record.runState === "awaiting_write_intent_commit") {
				record.runState = "commit_write";
				changed = true;
			}
		}
		if (changed)
			persist();
	},
	onError(error) { console.warn(`[Create Bedrock] Schematic state error: ${error}`); },
	partitionFor(record) {
		if (!record || !["cannon", "placement_header", "placement_chunk", "table"].includes(record.kind))
			throw new TypeError("Unknown Schematic persistent record");
		const location = record.location ?? record.anchor;
		return `${record.dimensionId}:${Math.floor(location.x / 16)}:${Math.floor(location.y / 16)}:${Math.floor(location.z / 16)}`;
	},
	storage: createWorldDynamicPropertyStorage(world)
});

function persist() {
	try { store.request(persistentRecords()); } catch (error) {
		failedOperations++;
		console.warn(`[Create Bedrock] Could not persist Schematic state: ${error}`);
	}
}

function selectedSlot(player) {
	const container = player?.getComponent?.("minecraft:inventory")?.container;
	const index = player?.selectedSlotIndex;
	if (!container || !Number.isInteger(index) || index < 0 || index >= container.size)
		return undefined;
	const itemStack = container.getItem(index);
	return { itemStack, setItem(item) { container.setItem(index, item); } };
}

function itemSnapshot(itemStack) {
	if (itemStack?.typeId !== SCHEMATIC_ITEM || typeof itemStack.getDynamicProperty !== "function")
		throw new TypeError("Hold a saved Schematic item");
	return parseSchematicSnapshot(itemStack.getDynamicProperty(SCHEMATIC_ITEM_STATE_PROPERTY));
}

function schematicItem(snapshot) {
	const item = new ItemStack(SCHEMATIC_ITEM, 1);
	item.setDynamicProperty(SCHEMATIC_ITEM_STATE_PROPERTY, serializeSchematicSnapshot(snapshot));
	return item;
}

function selectionFor(itemStack) {
	const raw = itemStack?.getDynamicProperty?.(SCHEMATIC_SELECTION_PROPERTY);
	if (raw === undefined)
		return undefined;
	if (typeof raw !== "string" || raw.length > 256)
		throw new TypeError("Schematic selection data is invalid");
	const selection = JSON.parse(raw);
	if (typeof selection?.dimensionId !== "string")
		throw new TypeError("Schematic selection dimension is invalid");
	return { dimensionId: selection.dimensionId, location: assertLocation(selection.location, "Schematic first corner") };
}

function writeSelection(itemStack, selection) {
	itemStack.setDynamicProperty(SCHEMATIC_SELECTION_PROPERTY, JSON.stringify(selection));
	return itemStack;
}

function tableFor(block) {
	return tables.get(recordId("table", block.dimension.id, block.location));
}

function cannonFor(block) {
	return cannons.get(recordId("cannon", block.dimension.id, block.location));
}

function tableRecord(block) {
	const id = recordId("table", block.dimension.id, block.location);
	const existing = tables.get(id);
	if (existing)
		return existing;
	const created = { dimensionId: block.dimension.id, id, kind: "table", location: assertLocation(block.location, "Schematic Table location"), snapshot: undefined };
	tables.set(id, created);
	persist();
	return created;
}

function removeTable(dimensionId, location) {
	if (tables.delete(recordId("table", dimensionId, location)))
		persist();
}

function removeCannon(dimensionId, location) {
	const id = recordId("cannon", dimensionId, location);
	const record = cannons.get(id);
	if (!record)
		return;
	try {
		placements.abort(record.placementId, "schematicannon_removed");
		record.removed = true;
		record.runState = "rolling_back";
	} catch {
		cannons.delete(id);
	}
	persist();
}

function captureWithQuill(player, block) {
	const holder = selectedSlot(player);
	if (holder?.itemStack?.typeId !== SCHEMATIC_AND_QUILL_ITEM)
		return false;
	const first = selectionFor(holder.itemStack);
	if (!first) {
		writeSelection(holder.itemStack, { dimensionId: block.dimension.id, location: assertLocation(block.location, "Schematic first corner") });
		holder.setItem(holder.itemStack);
		player.sendMessage?.("Schematic first corner saved. Use the quill on the opposite corner.");
		return true;
	}
	if (first.dimensionId !== block.dimension.id)
		throw new Error("Schematic corners must be in the same dimension");
	const captured = captureSchematicSelection({
		first: first.location,
		name: "Captured Schematic",
		readBlock(location) {
			const target = block.dimension.getBlock(location);
			return target && { states: target.permutation.getAllStates(), typeId: target.typeId };
		},
		second: block.location
	});
	holder.setItem(schematicItem(captured.snapshot));
	player.sendMessage?.(`Captured ${captured.snapshot.blocks.length} Create blocks into a Schematic.`);
	return true;
}

function loadTable(player, block) {
	const holder = selectedSlot(player);
	const record = tableRecord(block);
	if (holder?.itemStack?.typeId === SCHEMATIC_ITEM) {
		record.snapshot = itemSnapshot(holder.itemStack);
		persist();
		player.sendMessage?.(`Schematic Table loaded ${record.snapshot.blocks.length} blocks.`);
		return true;
	}
	if (holder?.itemStack?.typeId === EMPTY_SCHEMATIC_ITEM && record.snapshot) {
		holder.setItem(schematicItem(record.snapshot));
		player.sendMessage?.("Schematic copied from the Schematic Table.");
		return true;
	}
	player.sendMessage?.(record.snapshot
		? `Schematic Table stores ${record.snapshot.name} (${record.snapshot.blocks.length} blocks).`
		: "Use a saved Schematic to load this Schematic Table.");
	return false;
}

function startCannon(player, block) {
	const holder = selectedSlot(player);
	if (holder?.itemStack?.typeId !== SCHEMATIC_ITEM)
		return false;
	if (cannons.size >= MAX_ACTIVE_CANNONS)
		throw new Error(`Only ${MAX_ACTIVE_CANNONS} Schematicannons may run concurrently`);
	if (cannonFor(block))
		throw new Error("This Schematicannon already has a placement in progress");
	const snapshot = itemSnapshot(holder.itemStack);
	const location = assertLocation(block.location, "Schematicannon location");
	const placementId = `cannon:${block.dimension.id}:${locationKey(location)}:${++nextPlacement}`;
	const anchor = { x: location.x, y: location.y + 1, z: location.z };
	placements.begin({ anchor, dimensionId: block.dimension.id, id: placementId, ownerId: player.id, snapshot });
	const record = {
		dimensionId: block.dimension.id,
		id: recordId("cannon", block.dimension.id, location),
		kind: "cannon",
		location,
		ownerId: player.id,
		placementId,
		runState: "awaiting_placement_commit"
	};
	cannons.set(record.id, record);
	persist();
	player.sendMessage?.(`Schematicannon preflight accepted ${snapshot.blocks.length} blocks; placement queued.`);
	return true;
}

function spawnBlueprint(player, block) {
	const location = { x: block.location.x + .5, y: block.location.y + 1.05, z: block.location.z + .5 };
	const entity = block.dimension.spawnEntity(CRAFTING_BLUEPRINT_ENTITY, location);
	entity.setDynamicProperty("createbedrock:blueprint_owner", player.id);
	entity.setDynamicProperty("createbedrock:blueprint_source", block.typeId);
	player.sendMessage?.("Crafting Blueprint placed.");
	return true;
}

function runCannons() {
	for (const record of [...cannons.values()].sort((left, right) => left.id.localeCompare(right.id))) {
		try {
			if (record.runState === "ready") {
				const prepared = placements.prepare(record.placementId);
				record.runState = prepared.phase === "rollback" ? "rolling_back" : "awaiting_write_intent_commit";
				persist();
			} else if (record.runState === "commit_write") {
				const result = placements.commitPrepared(record.placementId);
				if (result.completed)
					cannons.delete(record.id);
				else
					record.runState = placements.get(record.placementId).phase === "rollback" ? "rolling_back" : "ready";
				persist();
			} else if (record.runState === "rolling_back") {
				const result = placements.advance(record.placementId, CANNON_BATCH_SIZE);
				if (result.completed)
					cannons.delete(record.id);
				persist();
			}
		} catch (error) {
			failedOperations++;
			try { placements.abort(record.placementId, "runtime_failure"); } catch {}
		try {
			if (placements.get(record.placementId).phase === "rollback")
				record.runState = "rolling_back";
		} catch {}
			persist();
			console.warn(`[Create Bedrock] Schematicannon ${record.id} failed: ${error}`);
		}
	}
	store.tick();
}

function restore() {
	try {
		const restored = store.read();
		if (!restored)
			return;
		const placementHeaders = new Map();
		const placementChunks = new Map();
		for (const record of restored.records) {
			if (record?.kind === "placement_header")
				placementHeaders.set(record.id, record);
			else if (record?.kind === "placement_chunk") {
				const chunks = placementChunks.get(record.placementId) ?? [];
				chunks.push(record);
				placementChunks.set(record.placementId, chunks);
			}
			else if (record?.kind === "table") {
				const normalized = { ...record, location: assertLocation(record.location, "Schematic Table location") };
				if (normalized.snapshotSerialized !== undefined)
					normalized.snapshot = parseSchematicSnapshot(normalized.snapshotSerialized);
				delete normalized.snapshotSerialized;
				tables.set(normalized.id, normalized);
			} else if (record?.kind === "cannon")
				cannons.set(record.id, { ...record, location: assertLocation(record.location, "Schematicannon location") });
			else
				throw new Error("Unknown Schematic persistent record");
		}
		const placementRecords = [];
		for (const header of placementHeaders.values()) {
			const chunks = (placementChunks.get(header.id) ?? []).sort((left, right) => left.index - right.index);
			if (!Number.isInteger(header.operationChunks) || header.operationChunks < 1 || chunks.length !== header.operationChunks
				|| chunks.some((chunk, index) => chunk.index !== index || !Array.isArray(chunk.operations)))
				throw new Error(`Schematic placement ${header.id} has incomplete persisted operation shards`);
			const record = {
				...header,
				operations: chunks.flatMap(chunk => chunk.operations),
				snapshot: parseSchematicSnapshot(header.snapshotSerialized)
			};
			delete record.kind;
			delete record.operationChunks;
			delete record.snapshotSerialized;
			placementRecords.push(record);
		}
		for (const placementId of placementChunks.keys())
			if (!placementHeaders.has(placementId))
				throw new Error(`Schematic placement ${placementId} has operation shards without a header`);
		placements.restore(placementRecords);
		for (const record of cannons.values()) {
			const phase = placements.get(record.placementId).phase;
			if (record.runState === "awaiting_placement_commit" && phase === "placing")
				record.runState = "ready";
			else if (record.runState === "awaiting_write_intent_commit" && phase === "write_intent")
				record.runState = "commit_write";
			else if (!["ready", "commit_write", "rolling_back"].includes(record.runState))
				throw new Error(`Schematicannon ${record.id} has an invalid recovered state`);
		}
	} catch (error) {
		failedOperations++;
		console.warn(`[Create Bedrock] Could not restore Schematic state: ${error}`);
	}
}

export function getSchematicDiagnostics() {
	return {
		activeCannons: cannons.size,
		failedOperations,
		placements: placements.diagnostics(),
		persistence: store.diagnostics(),
		tables: tables.size
	};
}

export function registerSchematics() {
	if (registered)
		return false;
	registered = true;
	world.afterEvents.playerPlaceBlock.subscribe(event => {
		if (event.block?.typeId === SCHEMATIC_TABLE_BLOCK)
			tableRecord(event.block);
	});
	world.afterEvents.playerBreakBlock.subscribe(event => {
		if (event.block?.typeId === SCHEMATIC_TABLE_BLOCK)
			removeTable(event.dimension.id, event.block.location);
		if (event.block?.typeId === SCHEMATICANNON_BLOCK)
			removeCannon(event.dimension.id, event.block.location);
	});
	world.afterEvents.itemStartUseOn.subscribe(event => {
		try {
			if (event.itemStack?.typeId === SCHEMATIC_AND_QUILL_ITEM)
				captureWithQuill(event.source, event.block);
			else if (event.itemStack?.typeId === CRAFTING_BLUEPRINT_ITEM)
				spawnBlueprint(event.source, event.block);
		} catch (error) {
			failedOperations++;
			event.source.sendMessage?.(`Schematic operation rejected: ${error}`);
		}
	});
	world.afterEvents.playerInteractWithBlock.subscribe(event => {
		try {
			if (event.block?.typeId === SCHEMATIC_TABLE_BLOCK)
				loadTable(event.player, event.block);
			else if (event.block?.typeId === SCHEMATICANNON_BLOCK) {
				if (event.player.isSneaking) {
					const cannon = cannonFor(event.block);
					if (cannon) {
						placements.abort(cannon.placementId, "player_cancelled");
						cannon.runState = "rolling_back";
						persist();
						event.player.sendMessage?.("Schematicannon rollback queued.");
					}
				} else
					startCannon(event.player, event.block);
			}
		} catch (error) {
			failedOperations++;
			event.player.sendMessage?.(`Schematic operation rejected: ${error}`);
		}
	});
	registerTickHandler(runCannons, "schematics");
	restore();
	return true;
}
