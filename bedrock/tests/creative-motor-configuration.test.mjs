import assert from "node:assert/strict";
import test from "node:test";

import {
	CREATIVE_MOTOR_MAX_SPEED,
	CREATIVE_MOTOR_MIN_SPEED,
	creativeMotorFacingIndex,
	creativeMotorSpeed,
	isCreativeMotorValueBox,
	nudgeCreativeMotorSpeed,
	parseCreativeMotorMagnitude,
	parseCreativeMotorSpeed
} from "../behavior_pack/scripts/kinetics/creative-motor-configuration.js";

test("creative motor wrench configuration accepts exact signed RPM within Java's range", () => {
	assert.equal(CREATIVE_MOTOR_MIN_SPEED, -256);
	assert.equal(CREATIVE_MOTOR_MAX_SPEED, 256);
	assert.equal(parseCreativeMotorSpeed(" 127 "), 127);
	assert.equal(parseCreativeMotorSpeed("-256"), -256);
	assert.equal(parseCreativeMotorSpeed("256"), 256);
});

test("creative motor wrench configuration rejects fractional, malformed, and out-of-range RPM", () => {
	for (const value of ["12.5", "rpm", "", "0", "257", "-257"])
		assert.throws(() => parseCreativeMotorSpeed(value));
});

test("creative motor value box matches Java Create's active perpendicular side panels", () => {
	assert.equal(creativeMotorFacingIndex("south"), 3);
	assert.equal(creativeMotorFacingIndex("east"), 5);
	// A north/south motor shows boxes on its upper and lateral panels, not its
	// output face or underside.
	assert.equal(isCreativeMotorValueBox({ blockFace: 1, facingDirection: 3, faceLocation: { x: 0.5, y: 1, z: 0.5 } }), true);
	assert.equal(isCreativeMotorValueBox({ blockFace: 5, facingDirection: 3, faceLocation: { x: 1, y: 0.5, z: 0.5 } }), true);
	assert.equal(isCreativeMotorValueBox({ blockFace: 3, facingDirection: 3, faceLocation: { x: 0.5, y: 0.5, z: 1 } }), false);
	assert.equal(isCreativeMotorValueBox({ blockFace: 0, facingDirection: 3, faceLocation: { x: 0.5, y: 0, z: 0.5 } }), false);
	assert.equal(isCreativeMotorValueBox({ blockFace: 5, facingDirection: 3, faceLocation: { x: 1, y: 0.2, z: 0.5 } }), false);
	// A vertical motor instead shows boxes on all four horizontal side panels.
	assert.equal(isCreativeMotorValueBox({ blockFace: 2, facingDirection: 1, faceLocation: { x: 0.5, y: 0.5, z: 0 } }), true);
	assert.equal(isCreativeMotorValueBox({ blockFace: 1, facingDirection: 1, faceLocation: { x: 0.5, y: 1, z: 0.5 } }), false);
	assert.equal(isCreativeMotorValueBox({ blockFace: 1, facingDirection: "south", faceLocation: { x: 0.5, y: 1, z: 0.5 } }), true);
});

test("creative motor editor uses a signed direction and non-zero Java magnitude", () => {
	assert.equal(parseCreativeMotorMagnitude(" 256 "), 256);
	assert.throws(() => parseCreativeMotorMagnitude("0"));
	assert.equal(creativeMotorSpeed(1, 32), 32);
	assert.equal(creativeMotorSpeed(-1, 32), -32);
	assert.equal(nudgeCreativeMotorSpeed(255, 32), 256);
	assert.equal(nudgeCreativeMotorSpeed(-1, 1), 1);
	assert.equal(nudgeCreativeMotorSpeed(1, -1), -1);
});
