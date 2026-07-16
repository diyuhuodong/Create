import test from "node:test";

import { validateContentMaterialC2Execution } from "../tools/content-material-c2-execution-contract.mjs";

test("C2-C through C2-E retain runtime, Java assets, loot, language, and real acquisition paths", async () => {
	const result = await validateContentMaterialC2Execution();
	if (result.blocks !== 11 || result.recipes !== 8)
		throw new Error("Unexpected C2 execution contract coverage");
});
