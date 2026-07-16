import { world } from "@minecraft/server";

import { collectConnectedBlocks } from "./assembly-collector.js";
import { linkedLocationsForAssembly } from "./assembly-attachments.js";
import {
	assembleExternalDynamicAssembly,
	disassembleExternalDynamicAssembly,
	ensureExternalDynamicAssemblyProjection,
	getExternalDynamicAssembly,
	registerDynamicAssemblyOwnerRestorer,
	sampleDynamicAssemblyMotionContacts,
	setExternalDynamicAssemblyTransform,
	updateExternalDynamicAssemblyHost
} from "./contraption-runtime.js";
import {
	activateLinearActuator,
	advanceLinearActuator,
	createLinearActuatorState,
	freezeLinearActuator,
	normalizeLinearActuatorState,
	releaseLinearActuator,
	serializeLinearActuatorState
} from "./linear-actuator-state.js";
import { MAX_DYNAMIC_ASSEMBLY_BLOCKS } from "./dynamic-assembly-snapshot.js";
import { isMovableBlockType } from "./movable-blocks.js";
import { enqueueUniqueKernelTask, registerKernelTaskGroup, registerTickHandler } from "../kernel/index.js";

export const LINEAR_ACTUATOR_OWNER_KIND = "linear_actuator";
export const LINEAR_ACTUATOR_BLOCKS = new Map([
	["createbedrock:mechanical_piston", { kind: "mechanical_piston", maxDistance: 16 }],
	["createbedrock:sticky_mechanical_piston", { kind: "mechanical_piston", maxDistance: 16 }],
	["createbedrock:rope_pulley", { kind: "rope_pulley", maxDistance: 64 }],
	["createbedrock:hose_pulley", { kind: "hose_pulley", maxDistance: 64 }],
	["createbedrock:elevator_pulley", { kind: "rope_pulley", maxDistance: 256 }],
	["createbedrock:gantry_carriage", { kind: "gantry", maxDistance: 256 }]
]);

const LINEAR_ACTUATOR_TASK_BUDGET = 4;
const activeActuators = new Map();
let kineticWorld;

function keyFor(dimensionId, location) {
	return `${dimensionId}:${location.x}:${location.y}:${location.z}`;
}

function directionFor(block) {
	if (block?.typeId === "createbedrock:elevator_pulley")
		return { x: 0, y: -1, z: 0 };
	const facing = block?.permutation?.getAllStates?.()["minecraft:facing_direction"];
	return ({
		0: { x: 0, y: -1, z: 0 }, 1: { x: 0, y: 1, z: 0 }, 2: { x: 0, y: 0, z: -1 },
		3: { x: 0, y: 0, z: 1 }, 4: { x: -1, y: 0, z: 0 }, 5: { x: 1, y: 0, z: 0 },
		down: { x: 0, y: -1, z: 0 }, east: { x: 1, y: 0, z: 0 }, north: { x: 0, y: 0, z: -1 },
		south: { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 }, west: { x: -1, y: 0, z: 0 }
	})[facing] ?? { x: 0, y: 1, z: 0 };
}

function hostFor(record) {
	return {
		actuatorLocation: { ...record.location },
		blockTypeId: record.blockTypeId,
		kind: LINEAR_ACTUATOR_OWNER_KIND,
		key: record.key,
		state: serializeLinearActuatorState(record.state),
		...(record.targetDistance === undefined ? {} : { targetDistance: record.targetDistance })
	};
}

function normalizeTargetDistance(state, targetDistance) {
	if (!Number.isInteger(targetDistance) || targetDistance < 0 || targetDistance > state.maxDistance * 4096)
		throw new RangeError("Elevator targets must remain within the owning pulley range");
	return targetDistance;
}

function restoreOwner({ dimensionId, host, id }) {
	if (!host?.actuatorLocation || ![host.actuatorLocation.x, host.actuatorLocation.y, host.actuatorLocation.z].every(Number.isInteger))
		throw new TypeError("Restored linear actuator is missing its source location");
	const state = normalizeLinearActuatorState(host.state);
	if (state.assemblyId !== id)
		throw new TypeError("Restored linear actuator ownership does not match its dynamic assembly");
	if (host.blockTypeId !== undefined && !LINEAR_ACTUATOR_BLOCKS.has(host.blockTypeId))
		throw new TypeError("Restored linear actuator has an unsupported source block");
	activeActuators.set(host.key, {
		blockTypeId: host.blockTypeId,
		dimensionId,
		id,
		key: host.key,
		location: { ...host.actuatorLocation },
		state,
		...(host.targetDistance === undefined ? {} : { targetDistance: normalizeTargetDistance(state, host.targetDistance) })
	});
}

function collectPayload(block, direction) {
	const dimension = block.dimension;
	return collectConnectedBlocks({
		canCollect: data => isMovableBlockType(data.typeId),
		linkedLocations: location => linkedLocationsForAssembly(block.dimension.id, location),
		maxBlocks: MAX_DYNAMIC_ASSEMBLY_BLOCKS,
		readBlock(location) {
			const source = dimension.getBlock(location);
			return !source || source.typeId === "minecraft:air"
				? undefined
				: { states: source.permutation.getAllStates(), typeId: source.typeId };
		},
		start: {
			x: block.location.x + direction.x,
			y: block.location.y + direction.y,
			z: block.location.z + direction.z
		}
	});
}

function saveState(record, state, targetDistance = record.targetDistance) {
	record.state = normalizeLinearActuatorState(state);
	if (targetDistance === undefined)
		delete record.targetDistance;
	else
		record.targetDistance = normalizeTargetDistance(record.state, targetDistance);
	updateExternalDynamicAssemblyHost(record.dimensionId, record.id, () => hostFor(record));
}

function toggleActuator(block) {
	const definition = LINEAR_ACTUATOR_BLOCKS.get(block?.typeId);
	if (!definition)
		return false;
	const key = keyFor(block.dimension.id, block.location);
	const active = activeActuators.get(key);
	if (active) {
		const release = releaseLinearActuator(active.state);
		if (!release.released)
			return false;
		if (!disassembleExternalDynamicAssembly(active.dimensionId, active.id))
			return false;
		activeActuators.delete(key);
		return true;
	}

	const direction = directionFor(block);
	const blocks = collectPayload(block, direction);
	if (blocks.length === 0)
		return false;
	const state = activateLinearActuator(createLinearActuatorState({
		direction,
		kind: definition.kind,
		maxDistance: definition.maxDistance
	}), { assemblyId: `linear:${key}` });
	const record = {
		blockTypeId: block.typeId,
		dimensionId: block.dimension.id,
		id: state.assemblyId,
		key,
		location: { ...block.location },
		state
	};
	assembleExternalDynamicAssembly({
		anchor: blocks[0].location,
		dimensionId: record.dimensionId,
		host: hostFor(record),
		id: record.id,
		locations: blocks.map(entry => entry.location),
		owner: { actuatorKind: state.kind, kind: LINEAR_ACTUATOR_OWNER_KIND, key }
	});
	activeActuators.set(key, record);
	return true;
}

function processActuator(key) {
	const active = activeActuators.get(key);
	if (!active)
		return;
	const dynamic = getExternalDynamicAssembly(active.dimensionId, active.id);
	if (!dynamic) {
		activeActuators.delete(key);
		return;
	}
	if (!ensureExternalDynamicAssemblyProjection(active.dimensionId, active.id)) {
		if (active.state.phase === "active")
			saveState(active, freezeLinearActuator(active.state, "projection_recovery_failed"));
		return;
	}
	const speed = kineticWorld.speedAt(active.dimensionId, active.location);
	const targetSpeed = active.targetDistance === undefined
		? speed
		: Math.sign(active.targetDistance - active.state.distance) * Math.abs(speed);
	const movement = advanceLinearActuator(active.state, targetSpeed);
	if (!movement.changed)
		return;
	const targetDistance = movement.state.distance === active.targetDistance ? undefined : active.targetDistance;
	if (setExternalDynamicAssemblyTransform(active.dimensionId, active.id, movement.transform)) {
		saveState(active, movement.state, targetDistance);
		sampleDynamicAssemblyMotionContacts(active.dimensionId);
		return;
	}
	if (active.state.phase === "active")
		saveState(active, freezeLinearActuator(active.state, dynamic.assembly.frozenReason ?? "world_blocked"));
}

/**
 * Elevator Contacts route a column request to one already assembled Elevator
 * Pulley.  The target is stored alongside the pulley host state, so restart
 * recovery cannot invent movement from transient UI state.
 */
export function requestElevatorPulleyForColumn({ column, dimensionId, targetY } = {}) {
	if (!Number.isInteger(column?.x) || !Number.isInteger(column?.z) || !Number.isInteger(targetY) || typeof dimensionId !== "string")
		throw new TypeError("Elevator pulley requests require a dimension, X/Z column, and target Y");
	const candidates = [...activeActuators.values()].filter(record => record.dimensionId === dimensionId
		&& record.blockTypeId === "createbedrock:elevator_pulley"
		&& record.location.x === column.x && record.location.z === column.z);
	if (candidates.length !== 1)
		return { ok: false, reason: candidates.length === 0 ? "pulley_unassembled" : "ambiguous_pulleys" };
	const active = candidates[0];
	const targetDistance = normalizeTargetDistance(active.state, active.location.y - targetY);
	saveState(active, active.state, targetDistance);
	return { id: active.id, ok: true, targetDistance };
}

export function registerLinearActuators(getKineticWorld) {
	kineticWorld = getKineticWorld();
	if (!kineticWorld || typeof kineticWorld.speedAt !== "function")
		throw new TypeError("Linear actuators require KineticWorld.speedAt()");
	registerDynamicAssemblyOwnerRestorer(LINEAR_ACTUATOR_OWNER_KIND, restoreOwner);
	registerKernelTaskGroup("linear_actuators", LINEAR_ACTUATOR_TASK_BUDGET);
	world.afterEvents.playerInteractWithBlock.subscribe(event => {
		if (!LINEAR_ACTUATOR_BLOCKS.has(event.block?.typeId))
			return;
		try {
			toggleActuator(event.block);
		} catch (error) {
			console.warn(`[Create Bedrock] Linear actuator interaction failed: ${error}`);
		}
	});
	registerTickHandler(() => {
		for (const key of activeActuators.keys())
			enqueueUniqueKernelTask(`linear-actuator:${key}`, () => processActuator(key), "linear_actuators");
	}, "linear_actuators");
}

export function getLinearActuatorDiagnostics() {
	return {
		active: activeActuators.size,
		frozen: [...activeActuators.values()].filter(record => record.state.phase === "frozen").length
	};
}
