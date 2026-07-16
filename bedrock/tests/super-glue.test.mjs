import assert from "node:assert/strict";
import test from "node:test";

import {
	glueBoundsFromPoints,
	glueBoundsVolume,
	glueContains,
	glueLocations,
	glueRecordId,
	transformGlueBounds,
	validateGlueSelection
} from "../behavior_pack/scripts/contraptions/super-glue.js";

test("Super Glue normalizes a bounded rectangular selection", () => {
	const bounds = validateGlueSelection({ x: 2, y: 3, z: 4 }, { x: 0, y: 4, z: 5 });
	assert.deepEqual(bounds, { min: { x: 0, y: 3, z: 4 }, max: { x: 2, y: 4, z: 5 } });
	assert.equal(glueBoundsVolume(bounds), 12);
	assert.equal(glueContains(bounds, { x: 1, y: 3, z: 5 }), true);
	assert.equal(glueContains(bounds, { x: 3, y: 3, z: 5 }), false);
	assert.equal(glueLocations(bounds).length, 12);
	assert.equal(glueRecordId("minecraft:overworld", bounds), "super-glue:minecraft:overworld:0:3:4:2:4:5");
});

test("Super Glue rejects selections that cannot fit the dynamic assembly safety boundary", () => {
	assert.throws(() => validateGlueSelection({ x: 0, y: 0, z: 0 }, { x: 7, y: 7, z: 8 }), /limit/);
	assert.throws(() => validateGlueSelection({ x: 0, y: 0, z: 0 }, { x: 25, y: 0, z: 0 }), /range/);
});

test("Super Glue cuboids rotate with a block-aligned dynamic assembly", () => {
	const bounds = glueBoundsFromPoints({ x: 10, y: 1, z: 20 }, { x: 11, y: 1, z: 22 });
	assert.deepEqual(transformGlueBounds(bounds, { x: 10, y: 1, z: 20 }, {
		rotationMilliDegrees: 90000,
		translation: { x: 4096, y: 0, z: -4096 }
	}), {
		min: { x: 9, y: 1, z: 19 },
		max: { x: 11, y: 1, z: 20 }
	});
});
