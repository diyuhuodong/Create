import test from "node:test";

import { validateStage3ProcessingSourceContract } from "../tools/stage3-processing-contract.mjs";

test("S3-11 processing source contract verifies resources, runtime, and recipe boundaries", async () => {
	const coverage = await validateStage3ProcessingSourceContract();
	if (coverage.blocks !== 4 || coverage.reports !== 3)
		throw new Error("S3-11 processing source contract coverage changed unexpectedly");
});
