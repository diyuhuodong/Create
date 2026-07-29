import assert from "node:assert/strict";
import test from "node:test";
import { buildP85StaticCandidate } from "../tools/p8-5-static-candidate.mjs";

const manifest = { header: { version: [0, 1, 0] } };
const artifact = { path: "bedrock/dist/createbedrock-0.1.0.mcaddon", sha256: "a".repeat(64), sizeBytes: 1 };
const ledger = { registrationEntries: [{ status: "implemented" }] , domainEntries: [{}] };
const p84 = { entries: [{ status: "equivalent" }] };

test("P8.5 freezes only statically complete registrations and domain conclusions", () => {
	const candidate = buildP85StaticCandidate({ artifact, behaviorManifest: manifest, resourceManifest: manifest, migrationLedger: ledger, p84 });
	assert.equal(candidate.staticState, "static_verified");
	assert.equal(candidate.platformReadiness, "pending_p8_6");
	assert.equal(candidate.candidateId, "0.1.0-aaaaaaaaaaaa");
	assert.throws(() => buildP85StaticCandidate({ artifact, behaviorManifest: manifest, resourceManifest: manifest, migrationLedger: { ...ledger, registrationEntries: [{ status: "partial" }] }, p84 }), /partial or missing/);
});
