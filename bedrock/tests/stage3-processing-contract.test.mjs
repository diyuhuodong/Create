import assert from "node:assert/strict";
import test from "node:test";

import { validateStage3ProcessingSourceContract } from "../tools/stage3-processing-contract.mjs";

test("S3-11 processing source contract verifies resources, runtime, and recipe boundaries", async () => {
	const coverage = await validateStage3ProcessingSourceContract();
	assert.deepEqual(coverage, {
		blocks: 4,
		directRecipes: 4,
		reports: 3,
		runtimeAbsorbed: 4,
		runtimeBoundaries: 3,
		staticRecords: 8
	});
});
