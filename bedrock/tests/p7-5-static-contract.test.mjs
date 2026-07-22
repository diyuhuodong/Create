import assert from "node:assert/strict";
import test from "node:test";

import { validateP75StaticContract } from "../tools/p7-5-static-contract.mjs";

test("P7.5 dynamic assemblies and trains pass the static release gate", async () => {
	assert.deepEqual(await validateP75StaticContract(), {
		packages: 8,
		projections: 84,
		scheduleConditions: 9,
		scheduleInstructions: 5
	});
});
