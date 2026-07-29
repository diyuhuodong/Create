import assert from "node:assert/strict";
import test from "node:test";

import { validateP75StaticContract } from "../tools/p7-5-static-contract.mjs";
import { MOVABLE_BLOCK_TYPES } from "../behavior_pack/scripts/contraptions/movable-blocks.js";

test("P7.5 dynamic assemblies and trains pass the static release gate", async () => {
	assert.deepEqual(await validateP75StaticContract(), {
		packages: 8,
		projections: MOVABLE_BLOCK_TYPES.size,
		scheduleConditions: 9,
		scheduleInstructions: 5
	});
});
