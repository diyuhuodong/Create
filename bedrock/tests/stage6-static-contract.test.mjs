import assert from "node:assert/strict";
import test from "node:test";

import { validateStage6StaticContract } from "../tools/stage6-static-contract.mjs";

test("Stage 6 equipment assets, records, recipes, and source provenance close together", async () => {
	const coverage = await validateStage6StaticContract();
	assert.deepEqual(coverage, { entries: 16, toolboxColors: 16 });
});
