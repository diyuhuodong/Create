import assert from "node:assert/strict";
import test from "node:test";

import { validateP73ProcessingExecutionContract } from "../tools/p7-3-processing-execution-contract.mjs";

test("P7.3 machine recipes load concrete catalogs through registered runtimes with declared Create items", async () => {
	assert.deepEqual(await validateP73ProcessingExecutionContract(), {
		machineRecipes: 171,
		processorKinds: 9,
		referencedCreateItems: 116,
		referencedFluidTypes: 13
	});
});
