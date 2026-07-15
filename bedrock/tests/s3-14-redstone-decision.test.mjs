import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateStage3RedstoneDecision, validateStage3RedstoneDecisionDocument } from "../tools/s3-14-redstone-decision-schema.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(testDirectory, "..");

async function decision() {
	return JSON.parse(await readFile(resolve(bedrockRoot, "data", "s3-14-redstone-decision.json"), "utf8"));
}

test("S3-14 upgrades to the 1.26.0 native-redstone baseline and owns every implementation-in-progress device", async () => {
	const coverage = await validateStage3RedstoneDecision();
	assert.deepEqual(coverage, {
		controls: 6,
		implementationInProgress: 29,
		target: "realm-console-1.26.0"
	});
});

test("S3-14 rejects experimental targets, duplicate entries, and false device implementation claims", async () => {
	const experimental = await decision();
	experimental.target.experimentalFeatures = ["Upcoming Creator Features"];
	assert.throws(() => validateStage3RedstoneDecisionDocument(experimental), /non-experimental target/);

	const duplicate = await decision();
	duplicate.entries.push({ ...duplicate.entries[0] });
	assert.throws(() => validateStage3RedstoneDecisionDocument(duplicate), /duplicate entry/);

	const implemented = await decision();
	implemented.entries[0].resolution = "implemented";
	assert.throws(() => validateStage3RedstoneDecisionDocument(implemented), /implementation in progress/);

	const pollingOnly = await decision();
	pollingOnly.input.nativeConsumer.status = "pending_implementation";
	assert.throws(() => validateStage3RedstoneDecisionDocument(pollingOnly), /native consumer events/);
});
