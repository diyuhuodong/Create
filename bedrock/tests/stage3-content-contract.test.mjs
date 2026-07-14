import assert from "node:assert/strict";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { STATIC_VISUAL_EXCEPTIONS, validateStage3SourceContentContract } from "../tools/stage3-content-contract.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(testDirectory, "..");

test("Stage-3 static content has behavior, translations, creative access, and source assets", async () => {
	const coverage = await validateStage3SourceContentContract({ bedrockRoot });

	assert.equal(coverage.staticEntries, 15);
	assert.equal(coverage.staticBlocks, 8);
	assert.deepEqual(coverage.visualFallbacks, [{
		identifier: "createbedrock:crushing_wheel",
		reason: STATIC_VISUAL_EXCEPTIONS.get("createbedrock:crushing_wheel")
	}]);
});
