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

test("S3-14 keeps the 1.21.80 compatibility baseline and names every output blocker", async () => {
	const coverage = await validateStage3RedstoneDecision();
	assert.deepEqual(coverage, {
		blockers: 29,
		controls: 6,
		target: "realm-console-1.21.80"
	});
});

test("S3-14 rejects experimental targets, duplicate blockers, and an unblocked output", async () => {
	const experimental = await decision();
	experimental.target.experimentalFeatures = ["Upcoming Creator Features"];
	assert.throws(() => validateStage3RedstoneDecisionDocument(experimental), /non-experimental target/);

	const duplicate = await decision();
	duplicate.blockers.push({ ...duplicate.blockers[0] });
	assert.throws(() => validateStage3RedstoneDecisionDocument(duplicate), /duplicate blocker/);

	const reopened = await decision();
	reopened.blockers[0].resolution = "implemented";
	assert.throws(() => validateStage3RedstoneDecisionDocument(reopened), /explicitly blocked/);
});
