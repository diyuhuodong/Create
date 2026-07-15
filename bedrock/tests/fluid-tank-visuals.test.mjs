import assert from "node:assert/strict";
import test from "node:test";

import { fluidFillLevel, fluidVisualKind, tankSegmentForNeighbors } from "../behavior_pack/scripts/fluids/fluid-tank-visuals.js";

test("Tank fill level rounds up visible contents and rejects invalid capacities", () => {
	assert.equal(fluidFillLevel({ capacity: 8_000, contents: undefined }), 0);
	assert.equal(fluidFillLevel({ capacity: 8_000, contents: { amount: 1 } }), 1);
	assert.equal(fluidFillLevel({ capacity: 8_000, contents: { amount: 2_001 } }), 2);
	assert.equal(fluidFillLevel({ capacity: 8_000, contents: { amount: 8_000 } }), 4);
	assert.throws(() => fluidFillLevel({ capacity: 0, contents: undefined }), /positive capacity/);
});

test("Tank visual kind and vertical segment use only supported runtime states", () => {
	assert.equal(fluidVisualKind({ typeId: "minecraft:water" }), "water");
	assert.equal(fluidVisualKind({ typeId: "minecraft:lava" }), "lava");
	assert.equal(fluidVisualKind({ typeId: "createbedrock:unknown" }), "empty");
	assert.equal(tankSegmentForNeighbors({ hasTankAbove: false, hasTankBelow: false }), "single");
	assert.equal(tankSegmentForNeighbors({ hasTankAbove: true, hasTankBelow: false }), "bottom");
	assert.equal(tankSegmentForNeighbors({ hasTankAbove: true, hasTankBelow: true }), "middle");
	assert.equal(tankSegmentForNeighbors({ hasTankAbove: false, hasTankBelow: true }), "top");
});
