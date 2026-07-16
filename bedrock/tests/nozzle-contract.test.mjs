import test from "node:test";

import { validateNozzleMaterial } from "../tools/content-material-nozzle-contract.mjs";

test("Nozzle retains its Java model texture, kinetic range, and moving-data behavior", async () => {
	const result = await validateNozzleMaterial();
	if (result.blocks !== 1 || result.persistenceSchema !== 1)
		throw new Error("Unexpected Nozzle coverage");
});
