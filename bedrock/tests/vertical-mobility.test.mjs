import assert from "node:assert/strict";
import test from "node:test";

import {
	blockLocationsForEntity,
	findVerticalMobilityBlock,
	verticalMotionImpulse
} from "../behavior_pack/scripts/materials/vertical-mobility.js";

test("vertical mobility inspects the entity feet and body blocks", () => {
	assert.deepEqual(blockLocationsForEntity({ x: -0.1, y: 4.8, z: 12.2 }), [
		{ x: -1, y: 4, z: 12 },
		{ x: -1, y: 5, z: 12 }
	]);
});

test("vertical mobility identifies Create ladders and scaffolding only", () => {
	const match = findVerticalMobilityBlock({ x: 1.2, y: 8.4, z: 3.7 }, location =>
		location.y === 9 ? { typeId: "createbedrock:brass_scaffolding" } : { typeId: "minecraft:ladder" });
	assert.equal(match?.kind, "scaffolding");
	assert.deepEqual(match?.location, { x: 1, y: 9, z: 3 });
	assert.equal(findVerticalMobilityBlock({ x: 1.2, y: 8.4, z: 3.7 }, () => ({ typeId: "minecraft:scaffolding" })), undefined);
});

test("vertical mobility supplies ladder-like jump, descent, and idle motion", () => {
	assert.ok(Math.abs(verticalMotionImpulse({ verticalVelocity: -0.6, isJumping: true }) - 0.8) < 0.000001);
	assert.equal(verticalMotionImpulse({ verticalVelocity: 0.2, isJumping: true }), 0);
	assert.ok(Math.abs(verticalMotionImpulse({ verticalVelocity: -0.4, isSneaking: true }) - 0.28) < 0.000001);
	assert.ok(Math.abs(verticalMotionImpulse({ verticalVelocity: 0.12 }) + 0.2) < 0.000001);
});
