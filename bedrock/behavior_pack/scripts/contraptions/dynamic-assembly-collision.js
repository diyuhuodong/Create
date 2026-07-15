import { assemblyTransformToRuntime, createAssemblyTransform } from "./assembly-transform.js";
import { normalizeDynamicAssemblySnapshot } from "./dynamic-assembly-snapshot.js";

const MAX_ROTATION_STEP = 15000;
const MAX_TRANSLATION_STEP = 1024;

function occupiedRange(minimum, maximum) {
	const first = Math.floor(minimum);
	const last = Math.ceil(maximum) - 1;
	return Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => first + index);
}

function shortestRotationDelta(start, end) {
	const delta = (end - start) % 360000;
	if (delta > 180000)
		return delta - 360000;
	if (delta < -180000)
		return delta + 360000;
	return delta;
}

function squaredDistance(left, right) {
	return (left.x - right.x) ** 2 + (left.y - right.y) ** 2 + (left.z - right.z) ** 2;
}

function interpolate(start, end, ratio) {
	return createAssemblyTransform({
		rotationMilliDegrees: Math.round(start.rotationMilliDegrees + shortestRotationDelta(start.rotationMilliDegrees, end.rotationMilliDegrees) * ratio),
		translation: {
			x: Math.round(start.translation.x + (end.translation.x - start.translation.x) * ratio),
			y: Math.round(start.translation.y + (end.translation.y - start.translation.y) * ratio),
			z: Math.round(start.translation.z + (end.translation.z - start.translation.z) * ratio)
		}
	});
}

function footprintAt(snapshot, transform) {
	const runtime = assemblyTransformToRuntime(transform);
	const radians = runtime.rotation * Math.PI / 180;
	const cosine = Math.cos(radians);
	const sine = Math.sin(radians);
	const occupied = new Map();
	for (const block of snapshot.blocks) {
		const x = snapshot.anchor.x + runtime.translation.x + block.relative.x * cosine - block.relative.z * sine;
		const y = snapshot.anchor.y + runtime.translation.y + block.relative.y;
		const z = snapshot.anchor.z + runtime.translation.z + block.relative.x * sine + block.relative.z * cosine;
		for (const blockX of occupiedRange(x, x + 1)) {
			for (const blockY of occupiedRange(y, y + 1)) {
				for (const blockZ of occupiedRange(z, z + 1)) {
					const location = { x: blockX, y: blockY, z: blockZ };
					occupied.set(`${blockX}:${blockY}:${blockZ}`, location);
				}
			}
		}
	}
	return [...occupied.values()];
}

/** Checks every conservative occupancy sample between two fixed-point transforms. */
export function findDynamicAssemblyCollision({ endTransform, readBlock, snapshot, startTransform }) {
	if (typeof readBlock !== "function")
		throw new TypeError("Dynamic assembly collision checks require readBlock()");
	const normalizedSnapshot = normalizeDynamicAssemblySnapshot(snapshot);
	const start = createAssemblyTransform(startTransform);
	const end = createAssemblyTransform(endTransform);
	const rotationSteps = Math.ceil(Math.abs(shortestRotationDelta(start.rotationMilliDegrees, end.rotationMilliDegrees)) / MAX_ROTATION_STEP);
	const translationSteps = Math.ceil(Math.sqrt(squaredDistance(start.translation, end.translation)) / MAX_TRANSLATION_STEP);
	const steps = Math.max(1, rotationSteps, translationSteps);
	for (let step = 0; step <= steps; step++) {
		const transform = interpolate(start, end, step / steps);
		for (const location of footprintAt(normalizedSnapshot, transform)) {
			const block = readBlock(location);
			if (block && block.typeId !== "minecraft:air")
				return { location, reason: "world_blocked", transform };
		}
	}
	return undefined;
}
