import assert from "node:assert/strict";
import test from "node:test";

import { validateContentMaterialSpecialItems } from "../tools/content-material-special-item-contract.mjs";

test("C1 experience nugget retains redemption, assets, and reversible storage recipes", async () => {
	const result = await validateContentMaterialSpecialItems();
	assert.equal(result.contentItems, 1);
	assert.equal(result.deferredSurvivalAcquisitions.length, 1);
});
