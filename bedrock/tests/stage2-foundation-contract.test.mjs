import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateStage2FoundationContract } from "../tools/stage2-foundation-contract.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));

test("Stage-2 bounded mechanical foundation is statically complete and recoverable", async () => {
	assert.deepEqual(await validateStage2FoundationContract({ bedrockRoot: resolve(testDirectory, "..") }), {
		blocks: 15,
		directRecipes: 11,
		entries: 22,
		runtimeBindings: 3,
		semanticRuntimeContracts: 3,
		structuralContentBlocks: 5
	});
});
