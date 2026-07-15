import { normalizeDisplayTargetState } from "./display-target.js";

export const NIXIE_TUBE_BLOCK = "createbedrock:nixie_tube";
export const MAX_NIXIE_TUBE_GROUP = 16;

function assertLocation(location) {
	if (!location || !Number.isInteger(location.x) || !Number.isInteger(location.y) || !Number.isInteger(location.z))
		throw new TypeError("Nixie tube groups require integer block locations");
	return { x: location.x, y: location.y, z: location.z };
}

function offset(location, direction) {
	return { x: location.x + direction.x, y: location.y + direction.y, z: location.z + direction.z };
}

function locationKey(location) {
	return `${location.x}:${location.y}:${location.z}`;
}

/** Tubes join across the horizontal axis perpendicular to their front face. */
export function nixieTubeGroupDirection(facing) {
	if (["north", "south", 2, 3].includes(facing))
		return { x: 1, y: 0, z: 0 };
	if (["east", "west", 4, 5].includes(facing))
		return { x: 0, y: 0, z: 1 };
	if (["up", "down", 0, 1].includes(facing))
		return { x: 1, y: 0, z: 0 };
	throw new TypeError("Nixie tube groups require a recognized facing direction");
}

function matchingTube(readTube, location, facing) {
	const tube = readTube(assertLocation(location));
	if (!tube || tube.typeId !== NIXIE_TUBE_BLOCK || tube.facing !== facing)
		return undefined;
	return { ...tube, location: assertLocation(location), display: normalizeDisplayTargetState(tube.display) };
}

/**
 * Collect the maximal same-facing tube run containing anchor. The caller owns
 * world access, so this stays deterministic and usable by unit tests.
 */
export function collectNixieTubeGroup({ anchor, readTube, maxSize = MAX_NIXIE_TUBE_GROUP } = {}) {
	if (typeof readTube !== "function")
		throw new TypeError("Nixie tube group collection requires a tube reader");
	if (!Number.isInteger(maxSize) || maxSize < 1 || maxSize > MAX_NIXIE_TUBE_GROUP)
		throw new RangeError(`Nixie tube group sizes must be from 1 through ${MAX_NIXIE_TUBE_GROUP}`);
	const seedLocation = assertLocation(anchor);
	const seed = readTube(seedLocation);
	if (!seed || seed.typeId !== NIXIE_TUBE_BLOCK)
		return undefined;
	const facing = seed.facing;
	const direction = nixieTubeGroupDirection(facing);
	let first = seedLocation;
	for (let count = 1; count < maxSize; count++) {
		const previous = offset(first, { x: -direction.x, y: -direction.y, z: -direction.z });
		if (!matchingTube(readTube, previous, facing))
			break;
		first = previous;
	}
	const tubes = [];
	for (let location = first; tubes.length < maxSize; location = offset(location, direction)) {
		const tube = matchingTube(readTube, location, facing);
		if (!tube)
			break;
		tubes.push(tube);
	}
	return { direction, facing, root: first, tubes };
}

export function nixieTubeGroupId(dimensionId, group) {
	if (typeof dimensionId !== "string" || dimensionId.length === 0 || !group?.root)
		throw new TypeError("Nixie display groups require a dimension and root location");
	return `nixie:${dimensionId}:${locationKey(group.root)}:${group.facing}`;
}

/** A group uses the root tube's style and concatenates its persisted first line. */
export function composeNixieTubeDisplay(group, { line = 0 } = {}) {
	if (!group || !Array.isArray(group.tubes) || group.tubes.length === 0)
		throw new TypeError("Nixie display composition requires a non-empty tube group");
	if (!Number.isInteger(line) || line < 0)
		throw new RangeError("Nixie display lines must be non-negative integers");
	const displays = group.tubes.map(tube => normalizeDisplayTargetState(tube.display));
	return {
		style: { ...displays[0].style },
		text: displays.map(display => display.lines[line] ?? "").join("")
	};
}
