import test from "node:test";

import { validateSandpaperMaterials } from "../tools/content-material-sandpaper-contract.mjs";

test("sandpaper retains its Java assets, recipe, durability, and polishing bridge", async () => {
	const result = await validateSandpaperMaterials();
	if (result.papers !== 2 || result.polishingOutputs !== 1)
		throw new Error("Unexpected sandpaper material coverage");
});
