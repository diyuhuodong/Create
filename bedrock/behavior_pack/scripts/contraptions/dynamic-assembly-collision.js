import { assemblyTransformToPose, createAssemblyTransform, transformAssemblyPoint } from "./assembly-transform.js";
import { normalizeDynamicAssemblySnapshot } from "./dynamic-assembly-snapshot.js";
import { assemblyPoseAngularDistanceMilliDegrees, interpolateAssemblyPoses } from "./pose-transform.js";

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
	if (start.poseSchemaVersion !== undefined || end.poseSchemaVersion !== undefined)
		return interpolateAssemblyPoses(assemblyTransformToPose(start), assemblyTransformToPose(end), ratio);
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
	const occupied = new Map();
	for (const block of snapshot.blocks) {
		const point = transformAssemblyPoint(transform, block.relative);
		const x = snapshot.anchor.x + point.x;
		const y = snapshot.anchor.y + point.y;
		const z = snapshot.anchor.z + point.z;
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
	const rotationDistance = start.poseSchemaVersion !== undefined || end.poseSchemaVersion !== undefined
		? assemblyPoseAngularDistanceMilliDegrees(assemblyTransformToPose(start), assemblyTransformToPose(end))
		: Math.abs(shortestRotationDelta(start.rotationMilliDegrees, end.rotationMilliDegrees));
	const rotationSteps = Math.ceil(rotationDistance / MAX_ROTATION_STEP);
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
