import { system, world } from "@minecraft/server";

import { registerMovingBlockDataContributor } from "../contraptions/moving-block-data.js";
import { getKineticSpeedAt } from "../kinetics/kinetic-runtime.js";
import { registerTickHandler } from "../kernel/index.js";
import { ShardedStateStore } from "../kernel/sharded-state-store.js";
import { createWorldDynamicPropertyStorage } from "../kernel/world-dynamic-property-storage.js";
import {
	DIRECTION_VECTORS,
	ENCASED_FAN_BLOCK,
	NOZZLE_BLOCK,
	nozzleFanLocation,
	nozzleImpulse,
	nozzleRangeForSpeed
} from "./nozzle.js";

const ACTIVE_STATE = "createbedrock:active";
const MAX_NOZZLES_PER_TICK = 24;
const records = new Map();
let failedUpdates = 0;
let pushedEntities = 0;
let roundRobin = 0;
let registered = false;

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function assertLocation(location) {
	if (!location || !Number.isInteger(location.x) || !Number.isInteger(location.y) || !Number.isInteger(location.z))
		throw new TypeError("Nozzle locations require integer coordinates");
	return { x: location.x, y: location.y, z: location.z };
}

function recordId(dimensionId, location) {
	if (typeof dimensionId !== "string" || dimensionId.length === 0)
		throw new TypeError("Nozzles require a dimension identifier");
	const normalized = assertLocation(location);
	return `nozzle:${dimensionId}:${normalized.x}:${normalized.y}:${normalized.z}`;
}

function partitionFor(record) {
	const location = record.location;
	return `${record.dimensionId}:${Math.floor(location.x / 16)}:${Math.floor(location.y / 16)}:${Math.floor(location.z / 16)}`;
}

const store = new ShardedStateStore({
	keyPrefix: "createbedrock:nozzle_state_v1",
	onError(error) { console.warn(`[Create Bedrock] Nozzle state error: ${error}`); },
	partitionFor(record) {
		if (record?.kind !== "nozzle")
			throw new TypeError("Unknown Nozzle persistent record");
		return partitionFor(record);
	},
	storage: createWorldDynamicPropertyStorage(world)
});

function persist() {
	try {
		store.request([...records.values()].map(record => ({
			kind: "nozzle", id: record.id, dimensionId: record.dimensionId, location: clone(record.location)
		})).sort((left, right) => left.id.localeCompare(right.id)));
	} catch (error) {
		failedUpdates++;
		console.warn(`[Create Bedrock] Could not persist Nozzle state: ${error}`);
	}
}

function isNozzle(block) { return block?.typeId === NOZZLE_BLOCK; }

function resolveBlock(record) {
	try { return world.getDimension(record.dimensionId).getBlock(record.location); } catch { return undefined; }
}

function createRecord(block) {
	if (!isNozzle(block))
		return undefined;
	const location = assertLocation(block.location);
	const id = recordId(block.dimension.id, location);
	const existing = records.get(id);
	if (existing)
		return existing;
	const record = { dimensionId: block.dimension.id, id, location };
	records.set(id, record);
	return record;
}

function facing(block) {
	const value = block?.permutation?.getAllStates?.()["minecraft:facing_direction"];
	return DIRECTION_VECTORS[value] ? value : undefined;
}

function fanForNozzle(block, direction) {
	const fanLocation = nozzleFanLocation(block.location, direction);
	const fan = block.dimension.getBlock(fanLocation);
	return fan?.typeId === ENCASED_FAN_BLOCK && facing(fan) === direction ? fan : undefined;
}

function setActive(block, active) {
	if (!isNozzle(block) || typeof block.setPermutation !== "function")
		return false;
	if (block.permutation.getAllStates?.()[ACTIVE_STATE] === active)
		return false;
	block.setPermutation(block.permutation.withState(ACTIVE_STATE, active));
	return true;
}

function blockAtVector(dimension, origin, vector, progress) {
	return dimension.getBlock({
		x: Math.floor(origin.x + vector.x * progress),
		y: Math.floor(origin.y + vector.y * progress),
		z: Math.floor(origin.z + vector.z * progress)
	});
}

function lineIsClear(dimension, origin, vector, distance) {
	const steps = Math.max(1, Math.ceil(distance * 2));
	for (let step = 1; step < steps; step++) {
		const block = blockAtVector(dimension, origin, vector, step / steps);
		if (!block || ["minecraft:air", "minecraft:water", "minecraft:flowing_water"].includes(block.typeId))
			continue;
		return false;
	}
	return true;
}

function eligibleEntity(entity) {
	if (!entity?.isValid || entity.isSneaking)
		return false;
	if (entity.typeId === "minecraft:player" && (entity.isFlying || entity.isGliding))
		return false;
	return typeof entity.applyImpulse === "function";
}

function pushEntities(block, range, pushing) {
	const center = { x: block.location.x + .5, y: block.location.y + .5, z: block.location.z + .5 };
	let pushed = 0;
	for (const entity of block.dimension.getEntities({ location: center, maxDistance: range })) {
		if (!eligibleEntity(entity))
			continue;
		const vector = { x: entity.location.x - center.x, y: entity.location.y - center.y, z: entity.location.z - center.z };
		const distance = Math.hypot(vector.x, vector.y, vector.z);
		if (!lineIsClear(block.dimension, center, vector, distance))
			continue;
		const impulse = nozzleImpulse({ distance, entityTypeId: entity.typeId, pushing, range, vector });
		if (!impulse)
			continue;
		try {
			entity.applyImpulse(impulse);
			pushed++;
		} catch {
			failedUpdates++;
		}
	}
	return pushed;
}

export function updateNozzle(record) {
	const block = resolveBlock(record);
	if (!isNozzle(block))
		return false;
	const direction = facing(block);
	const fan = direction === undefined ? undefined : fanForNozzle(block, direction);
	const speed = fan ? getKineticSpeedAt(record.dimensionId, fan.location) : 0;
	const range = nozzleRangeForSpeed(speed);
	setActive(block, range > 0 ? 1 : 0);
	if (range <= 0)
		return false;
	pushedEntities += pushEntities(block, range, speed > 0);
	return true;
}

export function captureNozzleMovingData(dimensionId, location) {
	return records.has(recordId(dimensionId, location)) ? {} : undefined;
}

export function detachNozzleMovingData(dimensionId, location) {
	if (!records.delete(recordId(dimensionId, location)))
		return false;
	persist();
	return true;
}

export function restoreNozzleMovingData(dimensionId, location, data) {
	if (data === undefined)
		return false;
	const id = recordId(dimensionId, location);
	if (records.has(id))
		throw new Error(`Cannot restore Nozzle state over an existing record: ${id}`);
	records.set(id, { dimensionId, id, location: assertLocation(location) });
	persist();
	return true;
}

export function getNozzleDiagnostics() {
	return { active: records.size, failedUpdates, pushedEntities, persistence: store.diagnostics() };
}

function restore() {
	try {
		const restored = store.read();
		if (!restored)
			return;
		for (const warning of restored.warnings)
			console.warn(`[Create Bedrock] Ignored Nozzle state shard ${warning.partition}: ${warning.error}`);
		for (const entry of restored.records) {
			if (entry?.kind !== "nozzle" || typeof entry.dimensionId !== "string")
				throw new Error("Nozzle state contains an unknown record");
			const location = assertLocation(entry.location);
			const id = recordId(entry.dimensionId, location);
			if (entry.id !== id)
				throw new Error("Nozzle state has an invalid identity");
			records.set(id, { dimensionId: entry.dimensionId, id, location });
		}
	} catch (error) {
		failedUpdates++;
		console.warn(`[Create Bedrock] Could not restore Nozzle state: ${error}`);
	}
}

export function registerNozzles() {
	if (registered)
		return false;
	registered = true;
	registerMovingBlockDataContributor(NOZZLE_BLOCK, "nozzle", {
		capture: captureNozzleMovingData,
		detach: detachNozzleMovingData,
		restore: restoreNozzleMovingData,
		schemaVersion: 1,
		validate(data) {
			if (!data || typeof data !== "object" || Array.isArray(data))
				throw new TypeError("Moving Nozzle data must be an empty object");
		}
	});
	world.afterEvents.playerPlaceBlock.subscribe(event => {
		try {
			if (createRecord(event.block))
				persist();
		} catch (error) {
			failedUpdates++;
			console.warn(`[Create Bedrock] Could not place Nozzle: ${error}`);
		}
	});
	world.afterEvents.playerBreakBlock.subscribe(event => {
		if (!isNozzle(event.block))
			return;
		try {
			if (records.delete(recordId(event.dimension.id, event.block.location)))
				persist();
		} catch (error) {
			failedUpdates++;
			console.warn(`[Create Bedrock] Could not remove Nozzle: ${error}`);
		}
	});
	registerTickHandler(() => {
		const ordered = [...records.values()].sort((left, right) => left.id.localeCompare(right.id));
		if (ordered.length === 0)
			return store.tick();
		const limit = Math.min(MAX_NOZZLES_PER_TICK, ordered.length);
		for (let index = 0; index < limit; index++) {
			const record = ordered[(roundRobin + index) % ordered.length];
			try { updateNozzle(record); } catch { failedUpdates++; }
		}
		roundRobin = (roundRobin + limit) % ordered.length;
		return store.tick();
	});
	system.run(restore);
	return true;
}
