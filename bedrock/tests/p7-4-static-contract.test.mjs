import assert from "node:assert/strict";
import test from "node:test";

import { validateP74StaticContract } from "../tools/p7-4-static-contract.mjs";

test("P7.4 Display, logistics, Boiler, and configuration semantics close together", async () => {
	assert.deepEqual(await validateP74StaticContract(), {
		boilerSchemas: 1,
		configurationSchemas: 1,
		displaySources: 26,
		displayTargets: 4,
		packages: 1
	});
});
