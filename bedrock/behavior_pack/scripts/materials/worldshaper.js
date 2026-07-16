export const WORLDSHAPER_ITEM = "createbedrock:handheld_worldshaper";
export const WORLDSHAPER_STATE_PROPERTY = "createbedrock:worldshaper_state";
export const WORLDSHAPER_STATE_SCHEMA = 1;
export const WORLDSHAPER_MAX_TARGETS = 32768;

export const WORLDSHAPER_BRUSHES = Object.freeze(["cuboid", "sphere", "cylinder", "surface", "cluster"]);
export const WORLDSHAPER_TOOLS = Object.freeze(["fill", "place", "replace", "clear", "overlay", "flatten"]);
export const WORLDSHAPER_PATTERNS = Object.freeze(["solid", "checkered", "inverse_checkered", "chance_25", "chance_50", "chance_75"]);
export const WORLDSHAPER_PLACEMENTS = Object.freeze(["merged", "attached", "inserted"]);

const AIRLIKE_BLOCKS = new Set(["minecraft:air", "minecraft:cave_air", "minecraft:void_air", "minecraft:water", "minecraft:flowing_water", "minecraft:lava", "minecraft:flowing_lava"]);
const FACE_VECTORS = Object.freeze({
	"0": { x: 0, y: -1, z: 0 },
	"1": { x: 0, y: 1, z: 0 },
	"2": { x: 0, y: 0, z: -1 },
	"3": { x: 0, y: 0, z: 1 },
	"4": { x: -1, y: 0, z: 0 },
	"5": { x: 1, y: 0, z: 0 },
	down: { x: 0, y: -1, z: 0 },
	up: { x: 0, y: 1, z: 0 },
	north: { x: 0, y: 0, z: -1 },
	south: { x: 0, y: 0, z: 1 },
	west: { x: -1, y: 0, z: 0 },
	east: { x: 1, y: 0, z: 0 }
});

function clone(value) {
	return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function assertLocation(location, label = "Worldshaper location") {
	if (![location?.x, location?.y, location?.z].every(Number.isInteger))
		throw new TypeError(`${label} must use integer block coordinates`);
	return { x: location.x, y: location.y, z: location.z };
}

function keyFor(location) {
	return `${location.x}:${location.y}:${location.z}`;
}

function included(value, values, fallback) {
	return values.includes(value) ? value : fallback;
}

function boundedInteger(value, fallback, minimum, maximum) {
	return Number.isInteger(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
}

function validSelectedBlock(value) {
	if (value === undefined)
		return undefined;
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new TypeError("Worldshaper selected material must be an object");
	if (typeof value.typeId !== "string" || !/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(value.typeId))
		throw new TypeError("Worldshaper selected material must use a qualified block identifier");
	const states = value.states ?? {};
	if (!states || typeof states !== "object" || Array.isArray(states))
		throw new TypeError("Worldshaper selected material states must be an object");
	for (const [key, state] of Object.entries(states)) {
		if (typeof key !== "string" || !["string", "number", "boolean"].includes(typeof state))
			throw new TypeError("Worldshaper selected material has an unsupported state");
	}
	return { states: clone(states), typeId: value.typeId };
}

function supportedTools(brush) {
	if (brush === "surface")
		return ["overlay", "replace", "clear"];
	if (brush === "cluster")
		return ["replace", "clear"];
	return WORLDSHAPER_TOOLS;
}

function normalizeParams(brush, params) {
	const value = Array.isArray(params) ? params : [];
	if (brush === "cuboid")
		return [
			boundedInteger(value[0], 1, 1, 32),
			boundedInteger(value[1], 1, 1, 32),
			boundedInteger(value[2], 1, 1, 32)
		];
	if (brush === "sphere")
		return [boundedInteger(value[0], 1, 0, 10), 1, 1];
	if (brush === "cylinder")
		return [boundedInteger(value[0], 1, 0, 8), boundedInteger(value[1], 1, 1, 8), 1];
	return [boundedInteger(value[0], 1, 1, 10), 1, 1];
}

/** A serializable per-item state; distinct Worldshapers never share settings. */
export function createWorldshaperState(patch = {}) {
	const brush = included(patch.brush, WORLDSHAPER_BRUSHES, "cuboid");
	const availableTools = supportedTools(brush);
	const requestedTool = included(patch.tool, WORLDSHAPER_TOOLS, "fill");
	return {
		brush,
		connectDiagonals: !!patch.connectDiagonals,
		fuzzy: !!patch.fuzzy,
		params: normalizeParams(brush, patch.params),
		pattern: included(patch.pattern, WORLDSHAPER_PATTERNS, "solid"),
		placement: included(patch.placement, WORLDSHAPER_PLACEMENTS, "merged"),
		...(patch.selected === undefined ? {} : { selected: validSelectedBlock(patch.selected) }),
		schemaVersion: WORLDSHAPER_STATE_SCHEMA,
		tool: availableTools.includes(requestedTool) ? requestedTool : availableTools[0]
	};
}

export function validateWorldshaperState(value) {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new TypeError("Worldshaper state must be an object");
	if (value.schemaVersion !== WORLDSHAPER_STATE_SCHEMA)
		throw new Error(`Worldshaper state must use schema ${WORLDSHAPER_STATE_SCHEMA}`);
	return createWorldshaperState(value);
}

export function parseWorldshaperState(serialized) {
	if (serialized === undefined || serialized === null || serialized === "")
		return createWorldshaperState();
	if (typeof serialized !== "string" || serialized.length > 4096)
		throw new TypeError("Worldshaper item state must be a short JSON string");
	return validateWorldshaperState(JSON.parse(serialized));
}

export function serializeWorldshaperState(state) {
	return JSON.stringify(validateWorldshaperState(state));
}

export function stateForWorldshaperItem(itemStack) {
	if (itemStack?.typeId !== WORLDSHAPER_ITEM || typeof itemStack.getDynamicProperty !== "function")
		throw new TypeError("Worldshaper state requires a Creative Worldshaper ItemStack");
	return parseWorldshaperState(itemStack.getDynamicProperty(WORLDSHAPER_STATE_PROPERTY));
}

export function writeWorldshaperItemState(itemStack, state) {
	if (itemStack?.typeId !== WORLDSHAPER_ITEM || typeof itemStack.setDynamicProperty !== "function")
		throw new TypeError("Worldshaper state requires a writable Creative Worldshaper ItemStack");
	itemStack.setDynamicProperty(WORLDSHAPER_STATE_PROPERTY, serializeWorldshaperState(state));
	return itemStack;
}

export function faceVector(face) {
	const vector = FACE_VECTORS[String(face).toLowerCase()];
	return vector ? { ...vector } : { x: 0, y: 1, z: 0 };
}

function add(left, right) {
	return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

function scale(vector, amount) {
	return { x: vector.x * amount, y: vector.y * amount, z: vector.z * amount };
}

function spanAlongFace(state, face) {
	const axis = face.x !== 0 ? 0 : face.y !== 0 ? 1 : 2;
	if (state.brush === "cuboid")
		return state.params[axis];
	if (state.brush === "sphere")
		return state.params[0] * 2 + 1;
	if (state.brush === "cylinder")
		return axis === 1 ? state.params[1] : state.params[0] * 2 + 1;
	return 1;
}

function originFor(state, target, face) {
	if (state.placement === "merged" || state.brush === "surface" || state.brush === "cluster")
		return target;
	const span = spanAlongFace(state, face);
	if (state.placement === "attached")
		return add(target, scale(face, Math.ceil(span / 2)));
	return add(target, scale(face, -Math.floor(span / 2)));
}

function pushPosition(positions, location) {
	if (positions.length >= WORLDSHAPER_MAX_TARGETS)
		throw new RangeError(`Worldshaper operations may affect at most ${WORLDSHAPER_MAX_TARGETS} blocks`);
	positions.push(location);
}

function cuboidPositions(origin, params) {
	const positions = [];
	for (let x = -Math.floor((params[0] - 1) / 2); x <= Math.floor(params[0] / 2); x++)
		for (let y = -Math.floor((params[1] - 1) / 2); y <= Math.floor(params[1] / 2); y++)
			for (let z = -Math.floor((params[2] - 1) / 2); z <= Math.floor(params[2] / 2); z++)
				pushPosition(positions, { x: origin.x + x, y: origin.y + y, z: origin.z + z });
	return positions;
}

function spherePositions(origin, radius) {
	const positions = [];
	for (let x = -radius - 1; x <= radius + 1; x++)
		for (let y = -radius - 1; y <= radius + 1; y++)
			for (let z = -radius - 1; z <= radius + 1; z++)
				if (Math.sqrt(x * x + y * y + z * z) < radius + .5)
					pushPosition(positions, { x: origin.x + x, y: origin.y + y, z: origin.z + z });
	return positions;
}

function cylinderPositions(origin, radius, height) {
	const positions = [];
	for (let x = -radius - 1; x <= radius + 1; x++)
		for (let z = -radius - 1; z <= radius + 1; z++) {
			if (Math.sqrt(x * x + z * z) >= radius + .42)
				continue;
			for (let layer = 0; layer < height; layer++)
				pushPosition(positions, { x: origin.x + x, y: origin.y + layer - Math.floor(height / 2), z: origin.z + z });
		}
	return positions;
}

function hashLocation(location) {
	let value = Math.imul(location.x, 73856093) ^ Math.imul(location.y, 19349663) ^ Math.imul(location.z, 83492791);
	value ^= value >>> 16;
	return (value >>> 0) % 100;
}

export function isWorldshaperPatternIncluded(pattern, location) {
	const normalized = included(pattern, WORLDSHAPER_PATTERNS, "solid");
	if (normalized === "checkered")
		return (location.x + location.y + location.z) % 2 !== 0;
	if (normalized === "inverse_checkered")
		return (location.x + location.y + location.z) % 2 === 0;
	const roll = hashLocation(location);
	if (normalized === "chance_25")
		return roll < 25;
	if (normalized === "chance_50")
		return roll < 50;
	if (normalized === "chance_75")
		return roll < 75;
	return true;
}

function fixedBrushPositions(state, target, face) {
	const origin = originFor(state, target, face);
	if (state.brush === "cuboid")
		return cuboidPositions(origin, state.params);
	if (state.brush === "sphere")
		return spherePositions(origin, state.params[0]);
	if (state.brush === "cylinder")
		return cylinderPositions(origin, state.params[0], state.params[1]);
	return undefined;
}

function replaceable(block) {
	return !block || block.isReplaceable === true || AIRLIKE_BLOCKS.has(block.typeId);
}

function neighborhood(face, connectDiagonals, surface) {
	const result = [];
	for (let x = -1; x <= 1; x++)
		for (let y = -1; y <= 1; y++)
			for (let z = -1; z <= 1; z++) {
				if (x === 0 && y === 0 && z === 0)
					continue;
				if (surface && (face.x !== 0 ? x !== 0 : face.y !== 0 ? y !== 0 : z !== 0))
					continue;
				if (!connectDiagonals && Math.abs(x) + Math.abs(y) + Math.abs(z) !== 1)
					continue;
				result.push({ x, y, z });
			}
	return result;
}

function dynamicBrushPositions(state, target, face, readBlock) {
	const surface = state.brush === "surface";
	const overlay = state.tool === "overlay";
	const source = readBlock(target);
	if (!source || replaceable(source))
		return [];
	const start = overlay ? add(target, face) : target;
	const offsets = neighborhood(face, state.connectDiagonals, surface);
	const visited = new Set();
	const pending = [start];
	const positions = [];
	while (pending.length > 0) {
		const current = pending.shift();
		const currentKey = keyFor(current);
		if (visited.has(currentKey))
			continue;
		visited.add(currentKey);
		const distanceSquared = (current.x - start.x) ** 2 + (current.y - start.y) ** 2 + (current.z - start.z) ** 2;
		if (distanceSquared >= state.params[0] ** 2)
			continue;
		const block = readBlock(current);
		let eligible;
		if (overlay) {
			const supporting = readBlock(add(current, scale(face, -1)));
			eligible = replaceable(block) && !replaceable(supporting) && (state.fuzzy || supporting?.typeId === source.typeId);
		} else {
			const forward = readBlock(add(current, face));
			eligible = !replaceable(block) && (state.fuzzy || block?.typeId === source.typeId)
				&& (!surface || replaceable(forward));
		}
		if (!eligible)
			continue;
		pushPosition(positions, current);
		for (const offset of offsets)
			pending.push(add(current, offset));
	}
	return positions;
}

/** Resolve the exact bounded cells affected by one authoritative use. */
export function resolveWorldshaperTargets({ face: rawFace, readBlock, settings, target }) {
	if (typeof readBlock !== "function")
		throw new TypeError("Worldshaper target resolution requires readBlock()");
	const state = validateWorldshaperState(settings);
	const targetLocation = assertLocation(target, "Worldshaper target");
	const face = faceVector(rawFace);
	const positions = fixedBrushPositions(state, targetLocation, face)
		?? dynamicBrushPositions(state, targetLocation, face, readBlock);
	return positions.filter(location => isWorldshaperPatternIncluded(state.pattern, location));
}

export function effectiveWorldshaperTool(settings) {
	const state = validateWorldshaperState(settings);
	return state.brush === "surface" && state.tool === "overlay" ? "place" : state.tool;
}

export function requiresWorldshaperMaterial(settings) {
	return !["clear", "flatten"].includes(effectiveWorldshaperTool(settings));
}

export function captureWorldshaperMaterial(block) {
	if (!block || typeof block.typeId !== "string" || AIRLIKE_BLOCKS.has(block.typeId))
		return undefined;
	const states = typeof block.permutation?.getAllStates === "function" ? block.permutation.getAllStates() : block.states ?? {};
	return validSelectedBlock({ states, typeId: block.typeId });
}

export function supportedWorldshaperTools(brush) {
	return [...supportedTools(included(brush, WORLDSHAPER_BRUSHES, "cuboid"))];
}
