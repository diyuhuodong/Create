import assert from "node:assert/strict";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateCinderFlourChain } from "../tools/cinder-flour-contract.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(testDirectory, "..");

test("P7.1B cinder flour has an exact crushing acquisition chain", async () => {
	assert.deepEqual(await validateCinderFlourChain({ bedrockRoot }), { items: 1, crushingRecipes: 1 });
});
