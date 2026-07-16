import test from "node:test";

import { validateBlazeBurnerContract } from "../tools/content-material-blaze-burner-contract.mjs";

test("Blaze Burner content carries stateful fuel semantics and Java-derived visuals", async () => {
	await validateBlazeBurnerContract();
});
