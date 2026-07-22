import { transformBlockAlignedVector } from "./pose-transform.js";

const DIRECTION_VECTOR = Object.freeze({
	down: { x: 0, y: -1, z: 0 },
	east: { x: 1, y: 0, z: 0 },
	north: { x: 0, y: 0, z: -1 },
	south: { x: 0, y: 0, z: 1 },
	up: { x: 0, y: 1, z: 0 },
	west: { x: -1, y: 0, z: 0 }
});
const VECTOR_DIRECTION = new Map(Object.entries(DIRECTION_VECTOR).map(([direction, vector]) => [`${vector.x}:${vector.y}:${vector.z}`, direction]));
const FACING_NUMBER = Object.freeze({ 0: "down", 1: "up", 2: "north", 3: "south", 4: "west", 5: "east" });
const DIRECTION_NUMBER = Object.freeze(Object.fromEntries(Object.entries(FACING_NUMBER).map(([number, direction]) => [direction, Number(number)])));

function clone(value) {
	return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export function transformAssemblyDirection(pose, direction) {
	const vector = DIRECTION_VECTOR[direction];
	if (!vector)
		throw new RangeError(`Unknown assembly direction ${direction}`);
	const transformed = transformBlockAlignedVector(pose, vector);
	const result = VECTOR_DIRECTION.get(`${transformed.x}:${transformed.y}:${transformed.z}`);
	if (!result)
		throw new Error("Block-aligned assembly direction produced a non-cardinal vector");
	return result;
}

export function transformAssemblyAxis(pose, axis) {
	if (!["x", "y", "z"].includes(axis))
		throw new RangeError(`Unknown assembly axis ${axis}`);
	const vector = transformBlockAlignedVector(pose, { x: axis === "x" ? 1 : 0, y: axis === "y" ? 1 : 0, z: axis === "z" ? 1 : 0 });
	return ["x", "y", "z"].find(component => Math.abs(vector[component]) === 1);
}

export function transformAssemblyBlockStates(states, pose) {
	const transformed = clone(states) ?? {};
	for (const [key, value] of Object.entries(transformed)) {
		if (key.endsWith("facing_direction") && FACING_NUMBER[value] !== undefined) {
			transformed[key] = DIRECTION_NUMBER[transformAssemblyDirection(pose, FACING_NUMBER[value])];
			continue;
		}
		if ((key.endsWith("cardinal_direction") || key.endsWith(":facing")) && DIRECTION_VECTOR[value]) {
			const direction = transformAssemblyDirection(pose, value);
			if (["up", "down"].includes(direction) && key.endsWith("cardinal_direction"))
				throw new Error(`State ${key} cannot represent vertical direction ${direction}`);
			transformed[key] = direction;
			continue;
		}
		if ((key.endsWith("pillar_axis") || key.endsWith(":axis")) && ["x", "y", "z"].includes(value)) {
			transformed[key] = transformAssemblyAxis(pose, value);
			continue;
		}
		if (key.endsWith("vertical_half") && ["top", "bottom"].includes(value)) {
			const direction = transformAssemblyDirection(pose, value === "top" ? "up" : "down");
			if (direction === "up" || direction === "down")
				transformed[key] = direction === "up" ? "top" : "bottom";
		}
	}
	return transformed;
}
