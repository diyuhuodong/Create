import test from "node:test";

import { validateSailMaterials } from "../tools/content-material-sail-contract.mjs";

test("sails include Java visuals, acquisition, movement, and a windmill speed gate", async () => {
	const result = await validateSailMaterials();
	if (result.sailBlocks !== 2 || result.minimumSails !== 8)
		throw new Error("Unexpected sail material coverage");
});
