import assert from "node:assert/strict";
import test from "node:test";

import { transformAssemblyBlockStates } from "../behavior_pack/scripts/contraptions/block-state-transform.js";
import {
	assemblyPoseFromAxisAngle,
	assemblyPoseToEuler,
	composeAssemblyPoses,
	inverseTransformAssemblyPosePoint,
	isBlockAlignedAssemblyPose,
	transformAssemblyPosePoint,
	withAssemblyPoseDelta
} from "../behavior_pack/scripts/contraptions/pose-transform.js";

function close(actual, expected, epsilon = 1e-8) {
	assert.ok(Math.abs(actual - expected) < epsilon, `${actual} should be close to ${expected}`);
}

test("assembly poses rotate around every cardinal axis and invert without drift", () => {
	for (const [axis, point, expected] of [
		[{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }],
		[{ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }],
		[{ x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }]
	]) {
		const pose = assemblyPoseFromAxisAngle({ axis, rotationMilliDegrees: 90000 });
		const transformed = transformAssemblyPosePoint(pose, point);
		close(transformed.x, expected.x);
		close(transformed.y, expected.y);
		close(transformed.z, expected.z);
		const restored = inverseTransformAssemblyPosePoint(pose, transformed);
		close(restored.x, point.x);
		close(restored.y, point.y);
		close(restored.z, point.z);
		assert.equal(isBlockAlignedAssemblyPose(pose), true);
	}
});

test("assembly pose composition preserves a complete orientation basis", () => {
	const pitch = assemblyPoseFromAxisAngle({ axis: { x: 1, y: 0, z: 0 }, rotationMilliDegrees: 90000 });
	const yaw = assemblyPoseFromAxisAngle({ axis: { x: 0, y: 1, z: 0 }, rotationMilliDegrees: 90000 });
	const composed = composeAssemblyPoses(yaw, pitch);
	const point = transformAssemblyPosePoint(composed, { x: 0, y: 1, z: 0 });
	close(point.x, 1);
	close(point.y, 0);
	close(point.z, 0);
	assert.equal(isBlockAlignedAssemblyPose(composed), true);
	assert.ok(Object.values(assemblyPoseToEuler(composed)).every(Number.isFinite));
});

test("block state materialization follows X/Y/Z assembly orientation", () => {
	const pose = assemblyPoseFromAxisAngle({ axis: { x: 1, y: 0, z: 0 }, rotationMilliDegrees: 90000 });
	assert.deepEqual(transformAssemblyBlockStates({
		"minecraft:facing_direction": 1,
		"minecraft:pillar_axis": "y"
	}, pose), {
		"minecraft:facing_direction": 3,
		"minecraft:pillar_axis": "z"
	});
});

test("pose deltas do not mutate their input", () => {
	const start = assemblyPoseFromAxisAngle();
	const next = withAssemblyPoseDelta(start, { axis: { x: 0, y: 0, z: 1 }, rotationMilliDegrees: 90000 });
	assert.notDeepEqual(next, start);
	assert.equal(isBlockAlignedAssemblyPose(next), true);
});
