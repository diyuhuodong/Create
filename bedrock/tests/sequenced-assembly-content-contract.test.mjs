import assert from "node:assert/strict";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateSequencedAssemblyContent } from "../tools/sequenced-assembly-content-contract.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(testDirectory, "..");

test("P7.2 sequenced assembly has all concrete and transitional content needed for its Java chains", async () => {
	assert.deepEqual(await validateSequencedAssemblyContent({ bedrockRoot }), { items: 6, sequencedRecipes: 3 });
});
