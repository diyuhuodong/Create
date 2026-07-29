import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildP8C4SemanticDifferenceLedger, validateP8C4SemanticDifferenceLedger } from "../tools/p8-c4-semantic-differences.mjs";

const bedrockRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = resolve(bedrockRoot, "data");
const json = name => readFile(resolve(dataRoot, name), "utf8").then(JSON.parse);

async function inputs() {
	return {
		cookingParity: await json("p7-7-cooking-parity.json"),
		gapLedger: await json("p7-7-gap-ledger.json"),
		guidanceLedger: await json("p7-6-guidance-ledger.json")
	};
}

test("P8 C4 converges each known semantic difference with implementation, impact, and acceptance", async () => {
	const source = await inputs();
	const actual = await json("p8-c4-semantic-differences.json");
	const expected = buildP8C4SemanticDifferenceLedger(source);
	assert.deepEqual(actual, expected);
	assert.deepEqual(validateP8C4SemanticDifferenceLedger(actual, source), {
		externalCompatibilityEntries: source.gapLedger.summary.classifications.external_compat,
		platformCapabilityBlocked: 22,
		records: 5,
		staticDifferences: 3
	});
	assert.equal(actual.records[0].subjects.length, 22);
	assert.equal(actual.records[1].summary.maxBlocks, 512);
	assert.deepEqual(actual.records[2].summary.staticWorldFluids, ["createbedrock:chocolate", "createbedrock:honey"]);
	assert.equal(actual.records[3].summary.advancements, 1150);
});

test("P8 C4 rejects drift that hides a platform limit or folds external compatibility into Create core", async () => {
	const source = await inputs();
	const hiddenCooking = buildP8C4SemanticDifferenceLedger(source);
	hiddenCooking.records[0].status = "implemented";
	assert.throws(() => validateP8C4SemanticDifferenceLedger(hiddenCooking, source), /explicit capability block/);
	const mergedCompatibility = buildP8C4SemanticDifferenceLedger(source);
	mergedCompatibility.records[4].platformState = "pending_platform_validation";
	assert.throws(() => validateP8C4SemanticDifferenceLedger(mergedCompatibility, source), /outside Create core completion/);
	const uncovered = buildP8C4SemanticDifferenceLedger(source);
	uncovered.records[0].subjects.pop();
	assert.throws(() => validateP8C4SemanticDifferenceLedger(uncovered, source), /does not cover every platform-blocked recipe/);
});
