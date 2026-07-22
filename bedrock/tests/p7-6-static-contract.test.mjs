import assert from "node:assert/strict";
import test from "node:test";

import { validateP76StaticContract } from "../tools/p7-6-static-contract.mjs";

test("P7.6 static contract closes equipment, resources, effects, and guidance", async () => {
	const result = await validateP76StaticContract();
	assert.deepEqual(result, { animations: 6, equipmentEntries: 28, guidanceFamilies: 52, particles: 13, resources: 5016, sounds: 79, storyboards: 179 });
});
