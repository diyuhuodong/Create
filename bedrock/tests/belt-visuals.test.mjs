import assert from "node:assert/strict";
import test from "node:test";

import { beltSegmentForNeighbors } from "../behavior_pack/scripts/logistics/belt-visuals.js";

test("belt visual segments distinguish isolated, leading, middle, and trailing blocks", () => {
	assert.equal(beltSegmentForNeighbors({ hasNext: false, hasPrevious: false }), "single");
	assert.equal(beltSegmentForNeighbors({ hasNext: true, hasPrevious: false }), "start");
	assert.equal(beltSegmentForNeighbors({ hasNext: true, hasPrevious: true }), "middle");
	assert.equal(beltSegmentForNeighbors({ hasNext: false, hasPrevious: true }), "end");
});
