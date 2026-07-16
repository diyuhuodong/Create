import assert from "node:assert/strict";
import test from "node:test";

import {
	chassisRange,
	isChassis,
	isLinearChassis,
	offsetLocation,
	oppositeFacing,
	perpendicularFacings,
	radialDistance,
	radialStickyProperty
} from "../behavior_pack/scripts/contraptions/chassis.js";

test("Chassis preserves Java's 1 through 16 attachment range in block state", () => {
	assert.equal(chassisRange({ "createbedrock:range": 1 }), 1);
	assert.equal(chassisRange({ "createbedrock:range": 16 }), 16);
	assert.equal(chassisRange({ "createbedrock:range": 99 }), 8);
	assert.equal(isChassis("createbedrock:radial_chassis"), true);
	assert.equal(isLinearChassis("createbedrock:secondary_linear_chassis"), true);
});

test("Chassis derives axial and radial attachment directions from its placement facing", () => {
	assert.equal(oppositeFacing(2), "3");
	assert.deepEqual(offsetLocation({ x: 1, y: 2, z: 3 }, 4, 2), { x: -1, y: 2, z: 3 });
	assert.deepEqual(perpendicularFacings(1).sort(), ["2", "3", "4", "5"]);
	assert.equal(radialStickyProperty(2), "createbedrock:sticky_north");
	assert.equal(radialDistance({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 }), 5);
});
