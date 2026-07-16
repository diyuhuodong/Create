import assert from "node:assert/strict";
import test from "node:test";

import { validateStage4DynamicFoundation } from "../tools/stage4-dynamic-foundation-contract.mjs";

test("Stage-4 dynamic foundation preserves the 512-block assembly budget and tracked source boundary", async () => {
	assert.deepEqual(await validateStage4DynamicFoundation(), {
		dynamicBlocks: 512,
		entries: 54,
		sources: 9
	});
});
