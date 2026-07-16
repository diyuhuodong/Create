export const ROSE_QUARTZ_LAMP_BLOCK = "createbedrock:rose_quartz_lamp";
export const ROSE_QUARTZ_LAMP_CLUSTER_DISTANCE = 16;

const NEIGHBOR_OFFSETS = Object.freeze([
	{ face: "north", x: 0, y: 0, z: -1 },
	{ face: "east", x: 1, y: 0, z: 0 },
	{ face: "south", x: 0, y: 0, z: 1 },
	{ face: "west", x: -1, y: 0, z: 0 },
	{ face: "up", x: 0, y: 1, z: 0 },
	{ face: "down", x: 0, y: -1, z: 0 }
]);

const OUTPUT_FACE_BITS = Object.freeze({ down: 32, east: 2, north: 1, south: 4, up: 16, west: 8 });

function assertBlockLocation(location) {
	if (!location || !Number.isInteger(location.x) || !Number.isInteger(location.y) || !Number.isInteger(location.z))
		throw new TypeError("Rose Quartz Lamp locations require integer coordinates");
	return { x: location.x, y: location.y, z: location.z };
}

function assertBooleanState(name, value) {
	if (!Number.isInteger(value) || ![0, 1].includes(value))
		throw new RangeError(`Rose Quartz Lamp ${name} must be 0 or 1`);
	return value;
}

function locationKey(location) {
	return `${location.x}:${location.y}:${location.z}`;
}

function offset(location, direction) {
	return { x: location.x + direction.x, y: location.y + direction.y, z: location.z + direction.z };
}

function manhattanDistance(left, right) {
	return Math.abs(left.x - right.x) + Math.abs(left.y - right.y) + Math.abs(left.z - right.z);
}

export function roseQuartzLampState(permutation) {
	const states = permutation?.getAllStates?.();
	if (!states)
		throw new TypeError("Rose Quartz Lamp requires a block permutation with states");
	return {
		activate: assertBooleanState("activate state", states["createbedrock:activate"]),
		powered: assertBooleanState("powered state", states["createbedrock:powered"]),
		powering: assertBooleanState("powering state", states["createbedrock:powering"])
	};
}

export function withRoseQuartzLampState(permutation, next) {
	if (!permutation || typeof permutation.withState !== "function")
		throw new TypeError("Rose Quartz Lamp requires a mutable block permutation");
	const current = roseQuartzLampState(permutation);
	const state = {
		activate: assertBooleanState("activate state", next.activate ?? current.activate),
		powered: assertBooleanState("powered state", next.powered ?? current.powered),
		powering: assertBooleanState("powering state", next.powering ?? current.powering)
	};
	return permutation
		.withState("createbedrock:powered", state.powered)
		.withState("createbedrock:powering", state.powering)
		.withState("createbedrock:activate", state.activate);
}

export function roseQuartzLampInputTransition(state, powerLevel) {
	if (!Number.isInteger(powerLevel) || powerLevel < 0 || powerLevel > 15)
		throw new RangeError("Rose Quartz Lamp input power must be an integer from 0 through 15");
	const current = {
		activate: assertBooleanState("activate state", state?.activate),
		powered: assertBooleanState("powered state", state?.powered),
		powering: assertBooleanState("powering state", state?.powering)
	};
	const powered = powerLevel > 0 ? 1 : 0;
	if (current.powered === powered)
		return { changed: false, rising: false, state: current };
	if (powered === 0)
		return { changed: true, rising: false, state: { ...current, powered: 0 } };
	return { changed: true, rising: true, state: { activate: 1, powered: 1, powering: 1 } };
}

export function roseQuartzLampTickTransition(state) {
	const current = {
		activate: assertBooleanState("activate state", state?.activate),
		powered: assertBooleanState("powered state", state?.powered),
		powering: assertBooleanState("powering state", state?.powering)
	};
	if (current.powering === 0 && current.activate === 0)
		return { changed: false, state: current };
	return {
		changed: current.powering !== current.activate || current.activate !== 0,
		state: { ...current, activate: 0, powering: current.activate }
	};
}

/**
 * Java visits the connected lamp component within Manhattan distance 16 but
 * treats the rising-edge source separately. The returned lamps exclude that
 * source, exactly matching the reset loop in RoseQuartzLampBlock.
 */
export function collectConnectedRoseQuartzLamps({ anchor, readBlock, maxDistance = ROSE_QUARTZ_LAMP_CLUSTER_DISTANCE } = {}) {
	if (typeof readBlock !== "function")
		throw new TypeError("Rose Quartz Lamp clusters require a block reader");
	if (!Number.isInteger(maxDistance) || maxDistance < 0 || maxDistance > ROSE_QUARTZ_LAMP_CLUSTER_DISTANCE)
		throw new RangeError(`Rose Quartz Lamp cluster distance must be from 0 through ${ROSE_QUARTZ_LAMP_CLUSTER_DISTANCE}`);
	const origin = assertBlockLocation(anchor);
	const visited = new Set([locationKey(origin)]);
	const frontier = [origin];
	const lamps = [];
	for (let index = 0; index < frontier.length; index++) {
		const current = frontier[index];
		for (const direction of NEIGHBOR_OFFSETS) {
			const candidate = offset(current, direction);
			if (manhattanDistance(origin, candidate) > maxDistance || !visited.add(locationKey(candidate)))
				continue;
			const block = readBlock(candidate);
			if (block?.typeId !== ROSE_QUARTZ_LAMP_BLOCK)
				continue;
			lamps.push({ block, location: candidate });
			frontier.push(candidate);
		}
	}
	return lamps;
}

/** Return faces that must remain connected: Create lamps never power a lamp neighbor. */
export function roseQuartzLampOutputFaces(location, readBlock) {
	if (typeof readBlock !== "function")
		throw new TypeError("Rose Quartz Lamp output faces require a block reader");
	const origin = assertBlockLocation(location);
	return NEIGHBOR_OFFSETS
		.filter(direction => readBlock(offset(origin, direction))?.typeId !== ROSE_QUARTZ_LAMP_BLOCK)
		.map(direction => direction.face);
}

export function roseQuartzLampOutputMask(faces) {
	if (!Array.isArray(faces))
		throw new TypeError("Rose Quartz Lamp output faces must be an array");
	let mask = 0;
	for (const face of faces) {
		const bit = OUTPUT_FACE_BITS[face];
		if (bit === undefined)
			throw new RangeError(`Rose Quartz Lamp cannot output through unknown face ${face}`);
		mask |= bit;
	}
	return mask;
}
