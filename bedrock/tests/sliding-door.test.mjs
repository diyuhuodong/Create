import assert from "node:assert/strict";
import test from "node:test";

import {
	doorLateralOffset,
	doorPairLocation,
	doorStatesForPower,
	toggledDoorState
} from "../behavior_pack/scripts/materials/sliding-door.js";

test("sliding doors synchronize their vertical pair and redstone states", () => {
	assert.deepEqual(doorPairLocation({ x: 2, y: 70, z: -3 }, 0), { x: 2, y: 71, z: -3 });
	assert.deepEqual(doorPairLocation({ x: 2, y: 70, z: -3 }, 1), { x: 2, y: 69, z: -3 });
	assert.deepEqual(doorStatesForPower(15), { open: 1, powered: 1 });
	assert.deepEqual(doorStatesForPower(0), { open: 0, powered: 0 });
	assert.deepEqual(toggledDoorState({ half: 0, hinge: 1, open: 0, powered: 1 }), { half: 0, hinge: 1, open: 1, powered: 1 });
});

test("sliding doors use opposite hinges for paired lateral movement", () => {
	assert.deepEqual(doorLateralOffset(2, 0), { x: 1, y: 0, z: 0 });
	assert.deepEqual(doorLateralOffset(2, 1), { x: -1, y: 0, z: 0 });
	assert.deepEqual(doorLateralOffset(5, 0), { x: 0, y: 0, z: 1 });
});
