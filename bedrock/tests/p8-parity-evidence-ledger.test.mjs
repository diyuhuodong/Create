import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildP8ParityEvidenceLedger, validateP8EvidenceRecordCompletion, validateP8ParityEvidenceLedger } from "../tools/p8-parity-evidence-ledger.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(testDirectory, "..");
const dataRoot = resolve(bedrockRoot, "data");

async function json(path) {
	return JSON.parse(await readFile(resolve(dataRoot, path), "utf8"));
}

async function inputs() {
	return {
		catalog: await json("java-registration-catalog.json"),
		javaBehaviorInventory: await json("java-behavior-inventory.json"),
		matrix: await json("migration-matrix.json"),
		migrationLedger: await json("migration-ledger.json")
	};
}

test("P8 parity evidence records every registration, domain artifact, and Java behavior source", async () => {
	const ledger = buildP8ParityEvidenceLedger(await inputs());
	assert.deepEqual(validateP8ParityEvidenceLedger(ledger), {
		records: 11267,
		evidenceState: { pending: 11267 },
		recordType: { behavior: 1319, domain: 9067, registration: 881 },
		status: { audit_pending: 1319, deferred_compat: 114, implemented: 424, partial: 9410 },
		total: 11267
	});
	const brassSheet = ledger.records.find(record => record.id === "registration:item:create:brass_sheet");
	assert.deepEqual(brassSheet.evidence.resourceProjections, ["createbedrock:brass_sheet"]);
	const kinetic = ledger.records.find(record => record.id === "registration:block:create:adjustable_chain_gearshift");
	assert.deepEqual(kinetic.evidence.bedrockRuntime, ["behavior_pack/scripts/kinetics/kinetic-runtime.js"]);
	const generated = await json("p8-parity-evidence-ledger.json");
	assert.deepEqual(generated, ledger);
});

test("P8 parity evidence rejects a source record with stale evidence state", async () => {
	const ledger = buildP8ParityEvidenceLedger(await inputs());
	const stale = structuredClone(ledger);
	stale.records[0].evidenceState = "linked";
	assert.throws(() => validateP8ParityEvidenceLedger(stale), /stale evidence state/);
});

test("P8 completion evidence fails closed when mapping, runtime, test, or platform proof is removed", async () => {
	const ledger = buildP8ParityEvidenceLedger(await inputs());
	const record = structuredClone(ledger.records.find(candidate => candidate.id === "registration:block:create:adjustable_chain_gearshift"));
	record.evidence = {
		...record.evidence,
		platformScenarios: ["kinetic_network"],
		staticTests: ["tests/kinetic-world.test.mjs"]
	};
	assert.doesNotThrow(() => validateP8EvidenceRecordCompletion(record));
	for (const field of ["bedrockRuntime", "platformScenarios", "resourceProjections", "staticTests"]) {
		const incomplete = structuredClone(record);
		incomplete.evidence[field] = [];
		assert.throws(() => validateP8EvidenceRecordCompletion(incomplete), /missing/);
	}
});
