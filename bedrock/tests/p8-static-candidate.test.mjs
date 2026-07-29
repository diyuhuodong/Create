import assert from "node:assert/strict";
import test from "node:test";
import { buildP85StaticCandidate } from "../tools/p8-5-static-candidate.mjs";

const manifest = { header: { version: [0, 1, 0] } };
const artifact = { path: "bedrock/dist/createbedrock-0.1.0.mcaddon", sha256: "a".repeat(64), sizeBytes: 1 };
const sourceKey = "block:create:test";
const behaviorSourceKey = "behavior:src/main/java/com/example/TestBehavior.java";
const completeEvidence = ({ id, recordType, sourceKey: recordSourceKey, status }) => ({
	id,
	recordType,
	sourceKey: recordSourceKey,
	status,
	evidenceState: "linked",
	evidence: {
		bedrockRuntime: ["behavior_pack/scripts/test-runtime.js"],
		platformScenarios: ["P8.6/test"],
		resourceProjections: recordType === "registration" ? ["createbedrock:test"] : [],
		staticContracts: ["tests/test-contract.test.mjs"],
		staticTests: ["tests/test-runtime.test.mjs"]
	}
});
const ledger = {
	registrationEntries: [{ kind: "block", mapping: { targets: ["createbedrock:test"] }, resources: "verified", sourceKey, status: "implemented" }],
	domainEntries: [{ sourceKey: "domain:test" }]
};
const p84 = { entries: [{ sourceKey: "domain:test", status: "equivalent" }] };
const acquisitionLedger = { entries: [{ registrationSourceKeys: [sourceKey], status: "recipe_output" }] };
const javaBehaviorInventory = { entries: [{ sourceKey: behaviorSourceKey, status: "equivalent" }] };
const parityEvidenceLedger = {
	records: [
		completeEvidence({ id: `registration:${sourceKey}`, recordType: "registration", sourceKey, status: "implemented" }),
		completeEvidence({ id: "domain:domain:test", recordType: "domain", sourceKey: "domain:test", status: "equivalent" }),
		completeEvidence({ id: `behavior:${behaviorSourceKey}`, recordType: "behavior", sourceKey: behaviorSourceKey, status: "equivalent" })
	]
};
const gapLedger = { entries: [] };
const inputs = { acquisitionLedger, artifact, behaviorManifest: manifest, gapLedger, javaBehaviorInventory, migrationLedger: ledger, p84, parityEvidenceLedger, resourceManifest: manifest };

test("P8.5 freezes only a closed registration, acquisition, behavior, evidence, and gap ledger", () => {
	const candidate = buildP85StaticCandidate(inputs);
	assert.equal(candidate.staticState, "static_verified");
	assert.equal(candidate.platformReadiness, "pending_p8_6");
	assert.equal(candidate.candidateId, "0.1.0-aaaaaaaaaaaa");
	assert.equal(candidate.staticEvidence.behaviorContracts, 1);
	assert.throws(() => buildP85StaticCandidate({ ...inputs, migrationLedger: { ...ledger, registrationEntries: [{ ...ledger.registrationEntries[0], mapping: { targets: [] } }] } }), /missing a Bedrock mapping/);
	assert.throws(() => buildP85StaticCandidate({ ...inputs, migrationLedger: { ...ledger, registrationEntries: [{ ...ledger.registrationEntries[0], resources: "missing" }] } }), /missing verified resources/);
	assert.throws(() => buildP85StaticCandidate({ ...inputs, acquisitionLedger: { entries: [{ registrationSourceKeys: [], status: "recipe_output" }] } }), /missing an acquisition link/);
	assert.throws(() => buildP85StaticCandidate({ ...inputs, javaBehaviorInventory: { entries: [{ sourceKey: behaviorSourceKey, status: "audit_pending" }] } }), /audit_pending behavior/);
	assert.throws(() => buildP85StaticCandidate({ ...inputs, parityEvidenceLedger: { records: parityEvidenceLedger.records.filter(record => record.recordType !== "behavior") } }), /missing its evidence link/);
	assert.throws(() => buildP85StaticCandidate({ ...inputs, parityEvidenceLedger: { records: parityEvidenceLedger.records.map(record => record.recordType === "behavior" ? { ...record, evidence: { ...record.evidence, bedrockRuntime: [] } } : record) } }), /missing bedrockRuntime/);
	assert.throws(() => buildP85StaticCandidate({ ...inputs, parityEvidenceLedger: { records: parityEvidenceLedger.records.map(record => record.recordType === "behavior" ? { ...record, evidence: { ...record.evidence, staticTests: [] } } : record) } }), /missing staticTests/);
	assert.throws(() => buildP85StaticCandidate({ ...inputs, parityEvidenceLedger: { records: parityEvidenceLedger.records.map(record => record.recordType === "domain" ? { ...record, evidence: { ...record.evidence, bedrockRuntime: [], staticTests: [] } } : record) } }), /missing bedrockRuntime/);
	assert.throws(() => buildP85StaticCandidate({ ...inputs, gapLedger: { entries: [{ classification: "core_audit_required" }] } }), /core audit or implementation gaps/);
	assert.throws(() => buildP85StaticCandidate({ ...inputs, parityEvidenceLedger: { records: parityEvidenceLedger.records.map(record => record.recordType === "registration" ? { ...record, evidenceState: "pending" } : record) } }), /pending core evidence/);
});
