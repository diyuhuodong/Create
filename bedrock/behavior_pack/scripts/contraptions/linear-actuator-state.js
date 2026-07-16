import { ASSEMBLY_SUBBLOCK_UNITS, createAssemblyTransform } from "./assembly-transform.js";

export const LINEAR_ACTUATOR_SCHEMA_VERSION = 1;
export const MAX_LINEAR_ACTUATOR_BLOCKS = 256;
export const LINEAR_SPEED_TO_SUBBLOCK_UNITS = 64;

const ACTUATOR_KINDS = new Set(["gantry", "hose_pulley", "mechanical_piston", "rope_pulley"]);
const ACTUATOR_PHASES = new Set(["active", "frozen", "idle"]);

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function assertId(value, label) {
	if (typeof value !== "string" || value.length === 0 || value.length > 256)
		throw new TypeError(`${label} must be a short non-empty string`);
	return value;
}

function normalizeDirection(direction) {
	if (![direction?.x, direction?.y, direction?.z].every(Number.isInteger))
		throw new TypeError("Linear actuator directions require integer axes");
	const components = [direction.x, direction.y, direction.z];
	if (components.filter(component => component !== 0).length !== 1 || !components.every(component => [-1, 0, 1].includes(component)))
		throw new RangeError("Linear actuator directions must be one cardinal axis");
	return { x: direction.x, y: direction.y, z: direction.z };
}

function normalizeDistance(value, label, maximum) {
	if (!Number.isInteger(value) || value < 0 || value > maximum * ASSEMBLY_SUBBLOCK_UNITS)
		throw new RangeError(`${label} must be within the configured linear actuator range`);
	return value;
}

function normalizeReason(value) {
	if (typeof value !== "string" || value.length === 0 || value.length > 512)
		throw new TypeError("Frozen linear actuators require a short reason");
	return value;
}

export function createLinearActuatorState({ direction, kind, maxDistance = 16 } = {}) {
	if (!ACTUATOR_KINDS.has(kind))
		throw new RangeError("Linear actuators require a supported kind");
	if (!Number.isInteger(maxDistance) || maxDistance < 1 || maxDistance > MAX_LINEAR_ACTUATOR_BLOCKS)
		throw new RangeError(`Linear actuator ranges must be between one and ${MAX_LINEAR_ACTUATOR_BLOCKS} blocks`);
	return {
		direction: normalizeDirection(direction),
		distance: 0,
		kind,
		maxDistance,
		phase: "idle",
		schemaVersion: LINEAR_ACTUATOR_SCHEMA_VERSION
	};
}

export function normalizeLinearActuatorState(value) {
	if (value?.schemaVersion !== LINEAR_ACTUATOR_SCHEMA_VERSION)
		throw new TypeError("Unsupported linear actuator state schema");
	const state = createLinearActuatorState(value);
	if (!ACTUATOR_PHASES.has(value.phase))
		throw new RangeError("Linear actuator phase is invalid");
	state.distance = normalizeDistance(value.distance, "Linear actuator distance", state.maxDistance);
	state.phase = value.phase;
	if (value.assemblyId !== undefined)
		state.assemblyId = assertId(value.assemblyId, "Linear actuator assembly id");
	if (value.frozenReason !== undefined)
		state.frozenReason = normalizeReason(value.frozenReason);
	if (state.phase === "active" && !state.assemblyId)
		throw new TypeError("Active linear actuators require an assembly id");
	if (state.phase === "frozen" && (!state.assemblyId || !state.frozenReason))
		throw new TypeError("Frozen linear actuators require an assembly id and reason");
	if (state.phase === "idle" && (state.assemblyId !== undefined || state.frozenReason !== undefined))
		throw new TypeError("Idle linear actuators cannot retain assembly ownership");
	return state;
}

export function activateLinearActuator(state, { assemblyId, distance = state?.distance } = {}) {
	const normalized = normalizeLinearActuatorState(state);
	if (normalized.phase !== "idle")
		throw new Error("Only idle linear actuators can acquire an assembly");
	return normalizeLinearActuatorState({
		...normalized,
		assemblyId: assertId(assemblyId, "Linear actuator assembly id"),
		distance: normalizeDistance(distance, "Linear actuator activation distance", normalized.maxDistance),
		phase: "active"
	});
}

export function transformForLinearActuator(state) {
	const normalized = normalizeLinearActuatorState(state);
	return createAssemblyTransform({
		translation: Object.fromEntries(Object.entries(normalized.direction)
			.map(([axis, component]) => [axis, component * normalized.distance]))
	});
}

export function linearTravelForSpeed(speed) {
	if (!Number.isFinite(speed))
		throw new TypeError("Linear actuator speed must be finite");
	const magnitude = Math.min(Math.round(Math.abs(speed) * LINEAR_SPEED_TO_SUBBLOCK_UNITS), ASSEMBLY_SUBBLOCK_UNITS / 4);
	return Math.sign(speed) * magnitude;
}

export function advanceLinearActuator(state, speed) {
	const normalized = normalizeLinearActuatorState(state);
	if (normalized.phase !== "active")
		return { changed: false, reason: normalized.phase, state: normalized, transform: transformForLinearActuator(normalized) };
	const travel = linearTravelForSpeed(speed);
	const maximum = normalized.maxDistance * ASSEMBLY_SUBBLOCK_UNITS;
	const distance = Math.max(0, Math.min(maximum, normalized.distance + travel));
	const next = normalizeLinearActuatorState({ ...normalized, distance });
	return {
		atLimit: travel !== 0 && distance === normalized.distance,
		changed: distance !== normalized.distance,
		reason: distance !== normalized.distance ? undefined : travel === 0 ? "stopped" : "limit",
		state: next,
		transform: transformForLinearActuator(next)
	};
}

export function freezeLinearActuator(state, reason) {
	const normalized = normalizeLinearActuatorState(state);
	if (normalized.phase !== "active")
		throw new Error("Only active linear actuators can freeze");
	return normalizeLinearActuatorState({ ...normalized, frozenReason: normalizeReason(reason), phase: "frozen" });
}

export function releaseLinearActuator(state) {
	const normalized = normalizeLinearActuatorState(state);
	if (normalized.phase === "active" && normalized.distance % ASSEMBLY_SUBBLOCK_UNITS !== 0)
		return { released: false, state: normalized };
	return {
		released: normalized.phase !== "idle",
		state: createLinearActuatorState(normalized)
	};
}

export function serializeLinearActuatorState(state) {
	return clone(normalizeLinearActuatorState(state));
}
