import { ASSEMBLY_QUARTER_TURN, createAssemblyTransform, isBlockAlignedAssemblyTransform } from "./assembly-transform.js";

export const SUPER_GLUE_ITEM = "createbedrock:super_glue";
export const SUPER_GLUE_ENTITY = "createbedrock:super_glue";
export const MAX_GLUE_SELECTION_DISTANCE = 24;
export const MAX_GLUE_SELECTION_BLOCKS = 512;

function assertLocation(location, label = "Glue location") {
	if (![location?.x, location?.y, location?.z].every(Number.isInteger))
		throw new TypeError(`${label} must use integer x, y, and z coordinates`);
	return { x: location.x, y: location.y, z: location.z };
}

function assertBounds(bounds) {
	const min = assertLocation(bounds?.min, "Glue bounds minimum");
	const max = assertLocation(bounds?.max, "Glue bounds maximum");
	if (min.x > max.x || min.y > max.y || min.z > max.z)
		throw new RangeError("Glue bounds minimum cannot exceed maximum");
	return { min, max };
}

function rotateCardinal(relative, quarterTurns) {
	switch ((quarterTurns % 4 + 4) % 4) {
		case 0: return { ...relative };
		case 1: return { x: -relative.z, y: relative.y, z: relative.x };
		case 2: return { x: -relative.x, y: relative.y, z: -relative.z };
		case 3: return { x: relative.z, y: relative.y, z: -relative.x };
	}
}

export function glueBoundsFromPoints(first, second) {
	const start = assertLocation(first, "Glue selection start");
	const end = assertLocation(second, "Glue selection end");
	return {
		min: { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), z: Math.min(start.z, end.z) },
		max: { x: Math.max(start.x, end.x), y: Math.max(start.y, end.y), z: Math.max(start.z, end.z) }
	};
}

export function glueBoundsVolume(bounds) {
	const normalized = assertBounds(bounds);
	return (normalized.max.x - normalized.min.x + 1)
		* (normalized.max.y - normalized.min.y + 1)
		* (normalized.max.z - normalized.min.z + 1);
}

export function validateGlueSelection(first, second, { maxBlocks = MAX_GLUE_SELECTION_BLOCKS, maxDistance = MAX_GLUE_SELECTION_DISTANCE } = {}) {
	if (!Number.isInteger(maxBlocks) || maxBlocks < 1)
		throw new RangeError("Glue selection maximum block count must be positive");
	if (!Number.isFinite(maxDistance) || maxDistance <= 0)
		throw new RangeError("Glue selection maximum distance must be positive");
	const start = assertLocation(first, "Glue selection start");
	const end = assertLocation(second, "Glue selection end");
	const distance = Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z);
	if (distance > maxDistance)
		throw new RangeError(`Glue selection exceeds the ${maxDistance}-block range`);
	const bounds = glueBoundsFromPoints(start, end);
	if (glueBoundsVolume(bounds) > maxBlocks)
		throw new RangeError(`Glue selection exceeds the ${maxBlocks}-block dynamic assembly limit`);
	return bounds;
}

export function glueContains(bounds, location) {
	const normalized = assertBounds(bounds);
	const point = assertLocation(location);
	return point.x >= normalized.min.x && point.x <= normalized.max.x
		&& point.y >= normalized.min.y && point.y <= normalized.max.y
		&& point.z >= normalized.min.z && point.z <= normalized.max.z;
}

export function glueLocations(bounds) {
	const normalized = assertBounds(bounds);
	const locations = [];
	for (let x = normalized.min.x; x <= normalized.max.x; x++)
		for (let y = normalized.min.y; y <= normalized.max.y; y++)
			for (let z = normalized.min.z; z <= normalized.max.z; z++)
				locations.push({ x, y, z });
	return locations;
}

export function glueRecordId(dimensionId, bounds) {
	if (typeof dimensionId !== "string" || dimensionId.length === 0)
		throw new TypeError("Glue records require a dimension identifier");
	const normalized = assertBounds(bounds);
	return `super-glue:${dimensionId}:${normalized.min.x}:${normalized.min.y}:${normalized.min.z}:${normalized.max.x}:${normalized.max.y}:${normalized.max.z}`;
}

/** Transform one persisted glue cuboid when its owning assembly materializes. */
export function transformGlueBounds(bounds, anchor, transform) {
	const normalized = assertBounds(bounds);
	const origin = assertLocation(anchor, "Glue assembly anchor");
	const normalizedTransform = createAssemblyTransform(transform);
	if (!isBlockAlignedAssemblyTransform(normalizedTransform))
		throw new Error("Glue can only materialize with a block-aligned assembly transform");
	const turns = normalizedTransform.rotationMilliDegrees / ASSEMBLY_QUARTER_TURN;
	const translation = Object.fromEntries(Object.entries(normalizedTransform.translation)
		.map(([axis, value]) => [axis, value / 4096]));
	const points = [];
	for (const x of [normalized.min.x, normalized.max.x])
		for (const y of [normalized.min.y, normalized.max.y])
			for (const z of [normalized.min.z, normalized.max.z]) {
				const rotated = rotateCardinal({ x: x - origin.x, y: y - origin.y, z: z - origin.z }, turns);
				points.push({ x: origin.x + translation.x + rotated.x, y: origin.y + translation.y + rotated.y, z: origin.z + translation.z + rotated.z });
			}
	return glueBoundsFromPoints(
		{ x: Math.min(...points.map(point => point.x)), y: Math.min(...points.map(point => point.y)), z: Math.min(...points.map(point => point.z)) },
		{ x: Math.max(...points.map(point => point.x)), y: Math.max(...points.map(point => point.y)), z: Math.max(...points.map(point => point.z)) }
	);
}
