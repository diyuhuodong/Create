import assert from "node:assert/strict";
import test from "node:test";

import { validateContentMaterialGauges } from "../tools/content-material-gauge-contract.mjs";

test("C2 gauges retain Java-derived visual states, analog output, runtime, and resources", async () => {
	const result = await validateContentMaterialGauges();
	assert.equal(result.persistentBlocks, 2);
});
