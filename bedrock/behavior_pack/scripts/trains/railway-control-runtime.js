import { system, world } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";

import { registerKernelTaskGroup, registerTickHandler } from "../kernel/index.js";
import { ShardedStateStore } from "../kernel/sharded-state-store.js";
import { createWorldDynamicPropertyStorage } from "../kernel/world-dynamic-property-storage.js";
import { getTrainAuthority, persistTrainAuthority } from "./train-runtime.js";
import { controllerRailTransition, passingTrainForEdge, SIGNAL_STATE, signalStateFor } from "./railway-control-state.js";

export const CONTROLLER_RAIL_BLOCK = "createbedrock:controller_rail";
export const TRACK_OBSERVER_BLOCK = "createbedrock:track_observer";
export const TRACK_SIGNAL_BLOCK = "createbedrock:track_signal";

const CONTROL_TASK_BUDGET = 4;
const SIGNAL_STATE_VALUE = Object.freeze({ [SIGNAL_STATE.RED]: 0, [SIGNAL_STATE.YELLOW]: 1, [SIGNAL_STATE.GREEN]: 2, [SIGNAL_STATE.INVALID]: 3 });
const TRACK_OFFSETS = [{ x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 }, { x: 0, y: -1, z: 0 }];
const controllerRails = new Map();
const observers = new Map();
const signals = new Map();
let failedUpdates = 0;
let registered = false;

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function assertLocation(location) {
	if (![location?.x, location?.y, location?.z].every(Number.isInteger))
		throw new TypeError("Railway controls require integer block locations");
	return { x: location.x, y: location.y, z: location.z };
}

function idFor(kind, dimensionId, location) {
	if (typeof dimensionId !== "string" || dimensionId.length === 0)
		throw new TypeError("Railway controls require a dimension id");
	location = assertLocation(location);
	return `${kind}:${dimensionId}:${location.x}:${location.y}:${location.z}`;
}

function partitionFor(record) {
	return `${record.dimensionId}:${Math.floor(record.location.x / 16)}:${Math.floor(record.location.y / 16)}:${Math.floor(record.location.z / 16)}`;
}

const store = new ShardedStateStore({
	keyPrefix: "createbedrock:railway_controls_v1",
	onError(error) { console.warn(`[Create Bedrock] Railway control state error: ${error}`); },
	partitionFor(record) {
		if (!["controller_rail", "observer", "signal"].includes(record?.kind))
			throw new TypeError("Unknown railway control record");
		return partitionFor(record);
	},
	storage: createWorldDynamicPropertyStorage(world)
});

function records() {
	return [
		...[...signals.values()].map(record => ({ ...clone(record), kind: "signal" })),
		...[...observers.values()].map(record => ({ ...clone(record), kind: "observer" })),
		...[...controllerRails.values()].map(record => ({ ...clone(record), kind: "controller_rail" }))
	].sort((left, right) => left.id.localeCompare(right.id));
}

function persist() {
	try { store.request(records()); } catch (error) { failedUpdates++; console.warn(`[Create Bedrock] Could not persist railway controls: ${error}`); }
}

function resolveBlock(record) {
	try { return world.getDimension(record.dimensionId).getBlock(record.location); } catch { return undefined; }
}

function setState(block, property, value) {
	try {
		if (!block?.permutation?.getAllStates || block.permutation.getAllStates()[property] === undefined || block.permutation.getAllStates()[property] === value)
			return false;
		block.setPermutation(block.permutation.withState(property, value));
		return true;
	} catch { return false; }
}

function nodeId(location) {
	return `${location.x}:${location.y}:${location.z}`;
}

function adjacentEdgeId(dimensionId, location) {
	const authority = getTrainAuthority(dimensionId);
	const snapshot = authority.graph.snapshot();
	const candidateNodes = new Set(TRACK_OFFSETS.map(offset => nodeId({ x: location.x + offset.x, y: location.y + offset.y, z: location.z + offset.z })));
	const edgeIds = snapshot.chunks.flatMap(chunk => chunk.edges).filter(edge => candidateNodes.has(edge.leftId) || candidateNodes.has(edge.rightId)).map(edge => edge.id).sort();
	return edgeIds[0];
}

function createRecord(kind, block) {
	const location = assertLocation(block.location);
	const record = { dimensionId: block.dimension.id, edgeId: adjacentEdgeId(block.dimension.id, location), id: idFor(kind, block.dimension.id, location), location };
	if (kind === "observer")
		return { ...record, filter: "", passingTrainId: undefined, powered: false };
	if (kind === "controller_rail")
		return { ...record, heldTrainIds: [] };
	return { ...record, state: SIGNAL_STATE.INVALID };
}

function registerRecord(block) {
	if (block?.typeId === TRACK_SIGNAL_BLOCK) {
		const record = createRecord("signal", block); signals.set(record.id, record); return true;
	}
	if (block?.typeId === TRACK_OBSERVER_BLOCK) {
		const record = createRecord("observer", block); observers.set(record.id, record); return true;
	}
	if (block?.typeId === CONTROLLER_RAIL_BLOCK) {
		const record = createRecord("controller_rail", block); controllerRails.set(record.id, record); return true;
	}
	return false;
}

function updateSignal(record) {
	const authority = getTrainAuthority(record.dimensionId);
	const edge = record.edgeId && authority.graph.getEdge(record.edgeId);
	const edgeAvailable = !!record.edgeId && authority.graph.isEdgeAvailable(record.edgeId);
	const adjacentReserved = edge && !edge.reservedBy && authority.graph.snapshot().chunks.flatMap(chunk => chunk.edges)
		.filter(candidate => candidate.id !== edge.id && (candidate.leftId === edge.leftId || candidate.leftId === edge.rightId || candidate.rightId === edge.leftId || candidate.rightId === edge.rightId))
		.some(candidate => authority.graph.getEdge(candidate.id)?.reservedBy !== undefined);
	const state = signalStateFor({ adjacentReserved, edge, edgeAvailable });
	if (record.state === state)
		return false;
	record.state = state;
	setState(resolveBlock(record), "createbedrock:signal_state", SIGNAL_STATE_VALUE[state]);
	return true;
}

function trainStates(authority) {
	return authority.trainIds.map(id => authority.controller.getTrain(id)).filter(Boolean);
}

function updateObserver(record) {
	const authority = getTrainAuthority(record.dimensionId);
	const passingTrainId = record.edgeId ? passingTrainForEdge({ edgeId: record.edgeId, filter: record.filter, trains: trainStates(authority) }) : undefined;
	const powered = passingTrainId !== undefined;
	if (record.powered === powered && record.passingTrainId === passingTrainId)
		return false;
	record.passingTrainId = passingTrainId;
	record.powered = powered;
	setState(resolveBlock(record), "createbedrock:powered", powered ? 1 : 0);
	return true;
}

function updateControllerRail(record) {
	const authority = getTrainAuthority(record.dimensionId);
	const block = resolveBlock(record);
	const powered = (block?.getRedstonePower?.() ?? 0) > 0;
	const trains = record.edgeId ? trainStates(authority).filter(train => train.edgeId === record.edgeId) : [];
	const transition = controllerRailTransition({ heldTrainIds: record.heldTrainIds, powered, trains });
	for (const id of transition.stop)
		authority.controller.setStopped(id, true);
	for (const id of transition.release)
		authority.controller.setStopped(id, false);
	if (transition.stop.length > 0 || transition.release.length > 0) {
		record.heldTrainIds = powered ? [...new Set([...record.heldTrainIds, ...transition.stop])].sort() : [];
		persistTrainAuthority();
		return true;
	}
	return false;
}

function configureObserver(record, player) {
	new ModalFormData().title("Track Observer")
		.label("Leave the filter blank to observe every train. A matching train id produces native redstone while it occupies this track segment.")
		.textField("Train id filter", "express", { defaultValue: record.filter })
		.submitButton("Save")
		.show(player).then(response => {
			if (response.canceled)
				return;
			const filter = String(response.formValues?.[0] ?? "").trim();
			if (filter.length > 64)
				throw new RangeError("Track Observer filters must be at most 64 characters");
			record.filter = filter;
			persist();
		}).catch(error => player.sendMessage?.(`Could not configure Track Observer: ${error}`));
}

function refresh() {
	let changed = false;
	for (const record of signals.values())
		changed = updateSignal(record) || changed;
	for (const record of observers.values())
		changed = updateObserver(record) || changed;
	for (const record of controllerRails.values())
		changed = updateControllerRail(record) || changed;
	if (changed)
		persist();
	store.tick();
}

function restore() {
	try {
		const restored = store.read();
		if (!restored)
			return;
		for (const record of restored.records) {
			if (!record || typeof record.id !== "string" || typeof record.dimensionId !== "string")
				continue;
			const location = assertLocation(record.location);
			const base = { ...record, location };
			if (record.kind === "signal") signals.set(record.id, { ...base, state: Object.values(SIGNAL_STATE).includes(record.state) ? record.state : SIGNAL_STATE.INVALID });
			if (record.kind === "observer") observers.set(record.id, { ...base, filter: typeof record.filter === "string" ? record.filter : "", passingTrainId: undefined, powered: false });
			if (record.kind === "controller_rail") controllerRails.set(record.id, { ...base, heldTrainIds: Array.isArray(record.heldTrainIds) ? record.heldTrainIds.filter(id => typeof id === "string") : [] });
		}
	} catch (error) { failedUpdates++; console.warn(`[Create Bedrock] Could not restore railway controls: ${error}`); }
}

export function getRailwayControlDiagnostics() {
	return { controllerRails: controllerRails.size, failedUpdates, observers: observers.size, signals: signals.size, storage: store.diagnostics() };
}

export function registerRailwayControls() {
	if (registered)
		return false;
	registered = true;
	registerKernelTaskGroup("railway_controls", CONTROL_TASK_BUDGET);
	world.afterEvents.playerPlaceBlock.subscribe(event => {
		try { if (registerRecord(event.block)) persist(); } catch (error) { failedUpdates++; console.warn(`[Create Bedrock] Could not register railway control: ${error}`); }
	});
	world.afterEvents.playerBreakBlock.subscribe(event => {
		try {
			const location = event.block.location;
			const dimensionId = event.dimension.id;
			const removed = signals.delete(idFor("signal", dimensionId, location)) || observers.delete(idFor("observer", dimensionId, location)) || controllerRails.delete(idFor("controller_rail", dimensionId, location));
			if (removed) persist();
		} catch { failedUpdates++; }
	});
	world.afterEvents.playerInteractWithBlock.subscribe(event => {
		if (event.block?.typeId !== TRACK_OBSERVER_BLOCK || !event.player.isSneaking)
			return;
		const record = observers.get(idFor("observer", event.block.dimension.id, event.block.location));
		if (record) configureObserver(record, event.player);
	});
	registerTickHandler(refresh);
	system.run(restore);
	return true;
}
