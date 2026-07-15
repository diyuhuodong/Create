import assert from "node:assert/strict";
import test from "node:test";

import { validateStage3VisualSourceContract } from "../tools/stage3-visual-contract.mjs";

test("S3-13 visual contract requires portable Crushing Wheel, belt segments, and Tank visuals", async () => {
	const coverage = await validateStage3VisualSourceContract();
	assert.ok(coverage.crusherCubes >= 10);
	assert.equal(coverage.tankSegments, 4);
});
