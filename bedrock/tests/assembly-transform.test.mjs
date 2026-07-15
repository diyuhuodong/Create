import assert from "node:assert/strict";
import test from "node:test";

import { ASSEMBLY_SUBBLOCK_UNITS, assemblyTransformToRuntime, createAssemblyTransform, isBlockAlignedAssemblyTransform, transformAssemblyPoint, withAssemblyTransformDelta } from "../behavior_pack/scripts/contraptions/assembly-transform.js";

test("assembly transforms persist canonical fixed-point motion and expose runtime coordinates", () => {
	const transform = createAssemblyTransform({
		rotationMilliDegrees: -90000,
		translation: { x: ASSEMBLY_SUBBLOCK_UNITS / 2, y: 0, z: 0 }
	});
	assert.equal(transform.rotationMilliDegrees, 270000);
	assert.equal(isBlockAlignedAssemblyTransform(transform), false);
	assert.deepEqual(assemblyTransformToRuntime(transform), {
		rotation: 270,
		translation: { x: 0.5, y: 0, z: 0 }
	});
	assert.deepEqual(withAssemblyTransformDelta(transform, {
		rotationMilliDegrees: 180000,
		translation: { x: ASSEMBLY_SUBBLOCK_UNITS / 2, y: 0, z: 0 }
	}), createAssemblyTransform({ rotationMilliDegrees: 90000, translation: { x: ASSEMBLY_SUBBLOCK_UNITS, y: 0, z: 0 } }));
	const point = transformAssemblyPoint(createAssemblyTransform({ rotationMilliDegrees: 90000 }), { x: 1, y: 2, z: 0 });
	assert.ok(Math.abs(point.x) < 1e-12);
	assert.equal(point.y, 2);
	assert.ok(Math.abs(point.z - 1) < 1e-12);
});
