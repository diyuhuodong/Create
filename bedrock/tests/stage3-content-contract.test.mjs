import assert from "node:assert/strict";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { STATIC_VISUAL_EXCEPTIONS, validateStage3SourceContentContract } from "../tools/stage3-content-contract.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(testDirectory, "..");

test("Stage-3 delivered content has behavior or explicit acquisition, translations, creative access, and source assets", async () => {
	const coverage = await validateStage3SourceContentContract({ bedrockRoot });

	assert.equal(coverage.staticEntries, 116);
	assert.equal(coverage.staticBlocks, 67);
	assert.equal(coverage.staticEntities, 2);
	assert.equal(coverage.staticItems, 26);
	assert.equal(coverage.foundationEntries, 0);
	assert.equal(coverage.foundationBlocks, 0);
	assert.equal(coverage.contentEntries, 116);
	assert.equal(coverage.contentBlocks, 67);
	assert.equal(coverage.contentItems, 26);
	assert.equal(STATIC_VISUAL_EXCEPTIONS.size, 3);
	assert.deepEqual(coverage.visualFallbacks.map(entry => entry.identifier).sort(), [
		"createbedrock:linear_chassis",
		"createbedrock:radial_chassis",
		"createbedrock:secondary_linear_chassis"
	]);
});
