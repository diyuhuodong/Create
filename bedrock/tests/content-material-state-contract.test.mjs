import assert from "node:assert/strict";
import test from "node:test";

import { validateContentMaterialStates } from "../tools/content-material-state-contract.mjs";

test("C1 state blocks retain source geometry, state, and light contracts", async () => {
	const result = await validateContentMaterialStates();
	assert.equal(result.contentBlocks, 10);
	assert.equal(result.verticalMobilityBlocks, 6);
});
