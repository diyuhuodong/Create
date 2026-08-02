import { system, world } from "@minecraft/server";

import { registerTickHandler } from "../kernel/index.js";
import { ShardedStateStore } from "../kernel/sharded-state-store.js";
import { createWorldDynamicPropertyStorage } from "../kernel/world-dynamic-property-storage.js";
import { getTrainAuthority, persistTrainAuthority } from "./train-runtime.js";
import { formationForBogeys, normalizeBogeyRecord } from "./rolling-stock-state.js";

export const LARGE_BOGEY_BLOCK = "createbedrock:large_bogey";
export const SMALL_BOGEY_BLOCK = "createbedrock:small_bogey";
export const FAKE_TRACK_BLOCK = "createbedrock:fake_track";
export const TRAIN_DOOR_BLOCK = "createbedrock:train_door";
export const TRAIN_TRAPDOOR_BLOCK = "createbedrock:train_trapdoor";

const bogeys = new Map();
const fakeTracks = new Map();
let registered = false;

function key(kind, dimensionId, location) { return `${kind}:${dimensionId}:${location.x}:${location.y}:${location.z}`; }
function location(value) {
	if (![value?.x, value?.y, value?.z].every(Number.isInteger)) throw new TypeError("Rolling stock locations must be integers");
	return { x: value.x, y: value.y, z: value.z };
}

const store = new ShardedStateStore({
	keyPrefix: "createbedrock:rolling_stock_v1",
	onError(error) { console.warn(`[Create Bedrock] Rolling stock state error: ${error}`); },
	partitionFor(record) { return `${record.dimensionId}:${Math.floor(record.location.x / 16)}:${Math.floor(record.location.z / 16)}`; },
	storage: createWorldDynamicPropertyStorage(world)
});

function persist() { store.request([...bogeys.values(), ...fakeTracks.values()].sort((left, right) => left.id.localeCompare(right.id))); }
function nodeId(value) { return `${value.x}:${value.y}:${value.z}`; }
function adjacentNode(dimensionId, at) {
	const graph = getTrainAuthority(dimensionId).graph;
	for (const offset of [{ x: 0, y: -1, z: 0 }, { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }]) {
		const id = nodeId({ x: at.x + offset.x, y: at.y + offset.y, z: at.z + offset.z });
		if (graph.getNode(id)) return id;
	}
}
function formationForTrain(dimensionId, trainId) { return formationForBogeys([...bogeys.values()].filter(record => record.dimensionId === dimensionId && record.trainId === trainId)); }

function bindBogey(block) {
	const size = block.typeId === LARGE_BOGEY_BLOCK ? "large" : "small";
	const at = location(block.location);
	const id = key("bogey", block.dimension.id, at);
	const authority = getTrainAuthority(block.dimension.id);
	const node = adjacentNode(block.dimension.id, at);
	const trainId = node && authority.trainIds.find(candidate => authority.controller.getTrain(candidate).nodeId === node && !authority.controller.getTrain(candidate).destinationId);
	const record = normalizeBogeyRecord({ dimensionId: block.dimension.id, id, location: at, size, trainId });
	bogeys.set(id, record);
	if (trainId) {
		const formation = formationForTrain(block.dimension.id, trainId);
		const train = authority.controller.getTrain(trainId);
		if (!train.destinationId) {
			authority.controller.removeTrain(trainId);
			authority.controller.registerTrain({ ...formation, id: trainId, nodeId: train.nodeId, speed: train.targetSpeed });
			persistTrainAuthority();
		}
	}
	persist();
}

function syncStationDoors() {
	for (const dimensionId of ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"]) {
		let dimension; try { dimension = world.getDimension(dimensionId); } catch { continue; }
		const authority = getTrainAuthority(dimensionId);
		for (const entity of dimension.getEntities({ type: "createbedrock:train" })) {
			const trainId = entity.getDynamicProperty("createbedrock:train_id");
			if (typeof trainId !== "string" || !authority.trainIds.includes(trainId)) continue;
			const train = authority.controller.getTrain(trainId);
			if (train.destinationId !== undefined) continue;
			for (const offset of [{ x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }]) {
				const at = { x: Math.floor(entity.location.x) + offset.x, y: Math.floor(entity.location.y), z: Math.floor(entity.location.z) + offset.z };
				const block = dimension.getBlock(at);
				if (![TRAIN_DOOR_BLOCK, TRAIN_TRAPDOOR_BLOCK].includes(block?.typeId) || block.permutation.getAllStates?.()["createbedrock:open"] === 1) continue;
				try { block.setPermutation(block.permutation.withState("createbedrock:open", 1)); } catch {}
			}
		}
	}
	store.tick();
}

function restore() {
	try {
		const restored = store.read();
		if (!restored) return;
		for (const record of restored.records) {
			if (record?.kind === "fake_track") fakeTracks.set(record.id, { ...record, location: location(record.location) });
			else if (record?.size) { const normalized = normalizeBogeyRecord(record); bogeys.set(normalized.id, normalized); }
		}
	} catch (error) { console.warn(`[Create Bedrock] Could not restore rolling stock: ${error}`); }
}

export function registerRollingStock() {
	if (registered) return false;
	registered = true;
	world.afterEvents.playerPlaceBlock.subscribe(event => {
		try {
			if ([SMALL_BOGEY_BLOCK, LARGE_BOGEY_BLOCK].includes(event.block.typeId)) bindBogey(event.block);
			if (event.block.typeId === FAKE_TRACK_BLOCK) { const at = location(event.block.location); fakeTracks.set(key("fake_track", event.block.dimension.id, at), { dimensionId: event.block.dimension.id, id: key("fake_track", event.block.dimension.id, at), kind: "fake_track", location: at }); persist(); }
		} catch (error) { console.warn(`[Create Bedrock] Could not bind rolling stock: ${error}`); }
	});
	world.afterEvents.playerBreakBlock.subscribe(event => { const at = location(event.block.location); if (bogeys.delete(key("bogey", event.dimension.id, at)) || fakeTracks.delete(key("fake_track", event.dimension.id, at))) persist(); });
	registerTickHandler(syncStationDoors);
	system.run(restore);
	return true;
}

export function getRollingStockDiagnostics() { return { bogeys: bogeys.size, fakeTracks: fakeTracks.size, storage: store.diagnostics() }; }
