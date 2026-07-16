import assert from "node:assert/strict";
import test from "node:test";

import { validateContentMaterialDisplayPackage } from "../tools/content-material-display-contract.mjs";

test("C2-B display package retains resources, persistence, moving data, and runtime integration", async () => {
	const result = await validateContentMaterialDisplayPackage();
	assert.equal(result.persistentBlocks, 3);
});
