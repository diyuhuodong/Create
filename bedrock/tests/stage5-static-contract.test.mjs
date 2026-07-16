import assert from "node:assert/strict";
import test from "node:test";

import { validateStage5StaticContract } from "../tools/stage5-static-contract.mjs";

test("Stage-5 train and package records have a static implementation, resources, and manual family coverage", async () => {
	assert.deepEqual(await validateStage5StaticContract(), { entries: 25, postboxColors: 16 });
});
