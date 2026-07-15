import test from "node:test";

import { validateStage3FluidSourceContract } from "../tools/stage3-fluid-contract.mjs";

test("S3-12 fluid source contract verifies resources, transactional filters, and creative endpoints", async () => {
	const coverage = await validateStage3FluidSourceContract();
	if (coverage.blocks !== 9)
		throw new Error("S3-12 fluid source contract coverage changed unexpectedly");
});
