import test from "node:test";

import { validateCrushedRawMaterials } from "../tools/content-material-crushed-raw-contract.mjs";

test("crushed raw materials restore the ore-crushing and splashing processing chain", async () => {
	await validateCrushedRawMaterials();
});
