export const SYMMETRY_STATE_SCHEMA = 1;
export const SYMMETRY_MAX_TARGETS = 4;
export const SYMMETRY_MODES = Object.freeze(["mirror_x", "mirror_z", "rotate_2", "rotate_4"]);

function assertLocation(value, label) {
	if (![value?.x, value?.y, value?.z].every(Number.isInteger))
		throw new TypeError(`${label} must use integer block coordinates`);
	return { x: value.x, y: value.y, z: value.z };
}

function locationKey(location) {
	return `${location.x}:${location.y}:${location.z}`;
}

function supportedMode(value) {
	return SYMMETRY_MODES.includes(value) ? value : SYMMETRY_MODES[0];
}

/** A small per-item state: one center and one plane/rotation mode. It is
 * deliberately incapable of storing arbitrary world data or unbounded areas. */
export function createSymmetryState({ center, mode } = {}) {
	return {
		...(center === undefined ? {} : { center: assertLocation(center, "Symmetry center") }),
		mode: supportedMode(mode),
		schemaVersion: SYMMETRY_STATE_SCHEMA
	};
}

export function validateSymmetryState(value) {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new TypeError("Symmetry Wand state must be an object");
	if (value.schemaVersion !== SYMMETRY_STATE_SCHEMA)
		throw new Error(`Symmetry Wand state must use schema ${SYMMETRY_STATE_SCHEMA}`);
	return createSymmetryState(value);
}

export function parseSymmetryState(serialized) {
	if (serialized === undefined || serialized === "")
		return createSymmetryState();
	if (typeof serialized !== "string" || serialized.length > 512)
		throw new TypeError("Symmetry Wand state must be a short JSON string");
	return validateSymmetryState(JSON.parse(serialized));
}

export function serializeSymmetryState(state) {
	return JSON.stringify(validateSymmetryState(state));
}

function rotateQuarter(center, source) {
	return { x: center.x - (source.z - center.z), y: source.y, z: center.z + source.x - center.x };
}

/** Resolve only the copies in addition to the original source block. */
export function resolveSymmetryTargets({ center, mode, source } = {}) {
	center = assertLocation(center, "Symmetry center");
	source = assertLocation(source, "Symmetry source");
	mode = supportedMode(mode);
	const first = mode === "mirror_x"
		? { x: 2 * center.x - source.x, y: source.y, z: source.z }
		: mode === "mirror_z"
			? { x: source.x, y: source.y, z: 2 * center.z - source.z }
			: rotateQuarter(center, source);
	const candidates = mode === "rotate_4"
		? [first, rotateQuarter(center, first), rotateQuarter(center, rotateQuarter(center, first))]
		: [first];
	const sourceKey = locationKey(source);
	const unique = new Map();
	for (const candidate of candidates) {
		const key = locationKey(candidate);
		if (key !== sourceKey)
			unique.set(key, candidate);
	}
	const locations = [...unique.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, location]) => location);
	if (locations.length > SYMMETRY_MAX_TARGETS)
		throw new RangeError("Symmetry Wand target budget exceeded");
	return locations;
}
