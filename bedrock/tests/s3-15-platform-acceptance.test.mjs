import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateStage3PlatformAcceptance, validateStage3PlatformAcceptanceDocument } from "../tools/s3-15-platform-acceptance-schema.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(testDirectory, "..");

async function ledger() {
	return JSON.parse(await readFile(resolve(bedrockRoot, "data", "s3-15-platform-acceptance.json"), "utf8"));
}

test("S3-15 records all three required platforms as pending until physical evidence exists", async () => {
	const report = await validateStage3PlatformAcceptance();
	assert.deepEqual(report, {
		acceptedPlatforms: 0,
		failedPlatforms: 0,
		pendingPlatforms: 3,
		platforms: 3,
		stressMinutes: 30
	});
});

test("S3-15 accepts a complete evidence-backed platform run", async () => {
	const completed = await ledger();
	for (const platform of completed.platforms) {
		platform.state = "passed";
		for (const scenario of platform.scenarios) {
			scenario.state = "passed";
			scenario.evidence = `work/evidence/s3-15/${platform.id}-${scenario.id}.md`;
		}
	}
	completed.outcome = "realm_console_accepted";
	assert.equal(validateStage3PlatformAcceptanceDocument(completed).acceptedPlatforms, 3);
});

test("S3-15 rejects a pass without evidence, incomplete scenarios, and false release outcomes", async () => {
	const noEvidence = await ledger();
	noEvidence.platforms[0].scenarios[0].state = "passed";
	assert.throws(() => validateStage3PlatformAcceptanceDocument(noEvidence), /requires evidence/);

	const duplicateScenario = await ledger();
	duplicateScenario.platforms[0].scenarios[1] = { ...duplicateScenario.platforms[0].scenarios[0] };
	assert.throws(() => validateStage3PlatformAcceptanceDocument(duplicateScenario), /required identifier exactly once/);

	const falseOutcome = await ledger();
	falseOutcome.outcome = "realm_console_accepted";
	assert.throws(() => validateStage3PlatformAcceptanceDocument(falseOutcome), /remain pending/);
});
