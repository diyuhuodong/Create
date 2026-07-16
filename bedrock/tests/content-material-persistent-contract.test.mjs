import assert from "node:assert/strict";
import test from "node:test";

import { validateContentMaterialPersistent } from "../tools/content-material-persistent-contract.mjs";

test("C2 persistent content retains Desk Bell, Rose Quartz Lamp, and Stockpile Switch resources and runtime", async () => {
	const result = await validateContentMaterialPersistent();
	assert.equal(result.contentBlocks, 3);
	assert.equal(result.persistentBlocks, 3);
	assert.equal(result.deferredSurvivalAcquisitions.length, 3);
});
