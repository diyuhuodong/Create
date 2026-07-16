import assert from "node:assert/strict";
import test from "node:test";

import { validateContentMaterialResources } from "../tools/content-material-resource-contract.mjs";

test("C1 resource content has Java-derived assets without false survival recipes", async () => {
	const result = await validateContentMaterialResources();
	assert.equal(result.contentBlocks, 6);
	assert.equal(result.contentItems, 6);
	assert.equal(result.deferredSurvivalAcquisitions.length, 10);
});
