import assert from "node:assert/strict";
import test from "node:test";

import { validateStage3LogisticsSourceContract } from "../tools/stage3-logistics-contract.mjs";

test("S3-10 logistics blocks and filter items meet the source resource contract", async () => {
	const coverage = await validateStage3LogisticsSourceContract();
	assert.deepEqual(coverage, {
		blocks: 13,
		creativeOnly: 1,
		directRecipes: 14,
		items: 2,
		runtimeAbsorbed: 11,
		runtimeBoundaries: 4,
		staticRecords: 26
	});
});
