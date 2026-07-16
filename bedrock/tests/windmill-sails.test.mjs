import assert from "node:assert/strict";
import test from "node:test";

import { windmillSailCount, windmillSpeedForSailCount } from "../behavior_pack/scripts/contraptions/windmill-sails.js";

test("windmills count only sail-tagged blocks and require eight sails", () => {
	assert.equal(windmillSailCount([{ typeId: "createbedrock:shaft" }, { typeId: "createbedrock:white_sail" }, { typeId: "createbedrock:sail_frame" }]), 2);
	assert.equal(windmillSpeedForSailCount(7), 0);
	assert.equal(windmillSpeedForSailCount(8), 1);
	assert.equal(windmillSpeedForSailCount(64), 8);
	assert.equal(windmillSpeedForSailCount(200), 16);
});
