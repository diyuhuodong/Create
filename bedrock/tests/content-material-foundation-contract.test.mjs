import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { validateContentMaterialFoundation } from "../tools/content-material-foundation-contract.mjs";

test("C0 foundation makes zinc obtainable through generated ore, drops, furnace processing, and storage", async () => {
	assert.deepEqual(await validateContentMaterialFoundation({ bedrockRoot: resolve(import.meta.dirname, "..") }), {
		materialItems: 2,
		oreFeatures: 2,
		oreRules: 2
	});
});
