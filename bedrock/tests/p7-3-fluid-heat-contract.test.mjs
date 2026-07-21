import assert from "node:assert/strict";
import test from "node:test";

import { validateP73FluidHeatContract } from "../tools/p7-3-fluid-heat-contract.mjs";

test("P7.3 retains every core Basin fluid/heat condition and its Bedrock resource contract", async () => {
	assert.deepEqual(await validateP73FluidHeatContract(), {
		basinRecipes: 18,
		customFluidBlocks: 2,
		customFluidBuckets: 2,
		visualKinds: 3
	});
});
