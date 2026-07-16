import test from "node:test";

import { validateTableClothMaterials } from "../tools/content-material-table-cloth-contract.mjs";

test("Table Cloths retain Java assets, shop state, Shopping Lists, and Depot checkout", async () => {
	const result = await validateTableClothMaterials();
	if (result.blocks !== 3 || result.items !== 1 || result.persistenceSchema !== 1)
		throw new Error("Unexpected Table Cloth coverage");
});
