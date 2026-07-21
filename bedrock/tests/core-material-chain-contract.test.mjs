import assert from "node:assert/strict";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateCoreMaterialChain } from "../tools/core-material-chain-contract.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(testDirectory, "..");

test("P7.1A core materials preserve Java recipes, resources, and press acquisition", async () => {
	assert.deepEqual(await validateCoreMaterialChain({ bedrockRoot }), {
		items: 8,
		directRecipes: 7,
		pressingRecipes: 1
	});
});
