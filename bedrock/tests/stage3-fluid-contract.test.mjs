import assert from "node:assert/strict";
import test from "node:test";

import { validateStage3FluidSourceContract } from "../tools/stage3-fluid-contract.mjs";

test("S3-12 fluid source contract verifies resources, transactional endpoints, and completed delivery state", async () => {
	const coverage = await validateStage3FluidSourceContract();
	assert.deepEqual(coverage, {
		blocks: 9,
		directRecipes: 8,
		runtimeAbsorbed: 9,
		runtimeBoundaries: 4,
		staticRecords: 18
	});
});
