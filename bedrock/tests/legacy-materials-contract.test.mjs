import test from "node:test";

import { validateLegacyMaterials } from "../tools/content-material-legacy-contract.mjs";

test("legacy materials retain world conversion behavior and Java assets", async () => {
	const result = await validateLegacyMaterials();
	if (result.items !== 3 || result.requiredLightSources !== 10)
		throw new Error("Unexpected legacy-material coverage");
});
