import assert from "node:assert/strict";
import test from "node:test";

import { turntableRotationDelta } from "../behavior_pack/scripts/materials/turntable.js";

test("turntable maps kinetic speed to Create's two-thirds player rotation", () => {
	assert.equal(turntableRotationDelta(0), 0);
	assert.equal(turntableRotationDelta(15), -10);
	assert.equal(turntableRotationDelta(-15), 10);
	assert.throws(() => turntableRotationDelta(Number.NaN));
});
