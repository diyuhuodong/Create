import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createPackArchive } from "./pack.mjs";
import { validateP8EvidenceRecordCompletion } from "./p8-parity-evidence-ledger.mjs";

export const P8_5_STATIC_CANDIDATE_SCHEMA_VERSION = 2;
const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");
const CORE_EVIDENCE_STATUSES = new Set(["equivalent", "implemented", "implemented_with_documented_difference", "platform_capability_blocked"]);

function version(manifest) {
	const value = manifest.header?.version;
	if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isInteger)) throw new Error("P8.5 requires a three-part pack version");
	return value.join(".");
}

function requiredArray(value, label) {
	if (!Array.isArray(value)) throw new TypeError(`P8.5 requires ${label}`);
	return value;
}

function evidenceByType(records, recordType) {
	return new Map(records.filter(record => record.recordType === recordType).map(record => [record.sourceKey, record]));
}

function assertRegistrationClosure(registrations, acquisitionEntries, evidenceRecords) {
	const acquisitionSources = new Set(acquisitionEntries.flatMap(entry => entry.registrationSourceKeys ?? []));
	const registrationEvidence = evidenceByType(evidenceRecords, "registration");
	for (const entry of registrations) {
		if (!Array.isArray(entry.mapping?.targets) || entry.mapping.targets.length === 0)
			throw new Error(`P8.5 registration ${entry.sourceKey} is missing a Bedrock mapping`);
		if (entry.resources !== "verified")
			throw new Error(`P8.5 registration ${entry.sourceKey} is missing verified resources`);
		if (["block", "item"].includes(entry.kind) && !acquisitionSources.has(entry.sourceKey))
			throw new Error(`P8.5 registration ${entry.sourceKey} is missing an acquisition link`);
		const evidence = registrationEvidence.get(entry.sourceKey);
		if (!evidence || evidence.status !== entry.status)
			throw new Error(`P8.5 registration ${entry.sourceKey} is missing its evidence link`);
		validateP8EvidenceRecordCompletion(evidence);
	}
	if (acquisitionEntries.some(entry => entry.status === "missing"))
		throw new Error("P8.5 cannot freeze a candidate with missing acquisition evidence");
	return acquisitionSources.size;
}

function assertBehaviorClosure(behaviorEntries, evidenceRecords) {
	const behaviorEvidence = evidenceByType(evidenceRecords, "behavior");
	for (const behavior of behaviorEntries) {
		if (behavior.status === "audit_pending")
			throw new Error(`P8.5 cannot freeze a candidate with audit_pending behavior ${behavior.sourceKey}`);
		const evidence = behaviorEvidence.get(behavior.sourceKey);
		if (!evidence)
			throw new Error(`P8.5 behavior ${behavior.sourceKey} is missing its evidence link`);
		validateP8EvidenceRecordCompletion(evidence);
	}
}

function assertDomainClosure(p84Entries, evidenceRecords) {
	const domainEvidence = evidenceByType(evidenceRecords, "domain");
	for (const entry of p84Entries) {
		const evidence = domainEvidence.get(entry.sourceKey);
		if (!evidence || evidence.status !== entry.status)
			throw new Error(`P8.5 domain ${entry.sourceKey} is missing its evidence link`);
		if (CORE_EVIDENCE_STATUSES.has(entry.status))
			validateP8EvidenceRecordCompletion(evidence);
	}
}

function assertCoreEvidenceClosure(evidenceRecords) {
	const coreRecords = evidenceRecords.filter(record => CORE_EVIDENCE_STATUSES.has(record.status));
	for (const record of coreRecords) {
		if (record.evidenceState === "pending")
			throw new Error(`P8.5 cannot freeze a candidate with pending core evidence ${record.id}`);
		validateP8EvidenceRecordCompletion(record);
	}
	return coreRecords.length;
}

export function buildP85StaticCandidate({ acquisitionLedger, artifact, behaviorManifest, gapLedger, javaBehaviorInventory, p84, parityEvidenceLedger, resourceManifest, migrationLedger, sourceCommit = "unresolved" }) {
	const registrations = migrationLedger.registrationEntries;
	const domains = migrationLedger.domainEntries;
	const acquisitionEntries = requiredArray(acquisitionLedger?.entries, "an acquisition ledger entry array");
	const behaviorEntries = requiredArray(javaBehaviorInventory?.entries, "a Java behavior inventory entry array");
	const evidenceRecords = requiredArray(parityEvidenceLedger?.records, "a parity evidence record array");
	const gapEntries = requiredArray(gapLedger?.entries, "a gap ledger entry array");
	if (registrations.some(entry => ["partial", "missing"].includes(entry.status))) throw new Error("P8.5 cannot freeze a candidate with partial or missing registrations");
	const p84Coverage = p84.entries.length;
	if (p84Coverage !== domains.length || p84.entries.some(entry => entry.status === "partial" || entry.status === "missing")) throw new Error("P8.5 requires complete P8.4 domain conclusions");
	assertBehaviorClosure(behaviorEntries, evidenceRecords);
	const acquisitionSources = assertRegistrationClosure(registrations, acquisitionEntries, evidenceRecords);
	assertDomainClosure(p84.entries, evidenceRecords);
	if (gapEntries.some(entry => ["core_audit_required", "core_implementation_required"].includes(entry.classification)))
		throw new Error("P8.5 cannot freeze a candidate with core audit or implementation gaps");
	const coreEvidenceRecords = assertCoreEvidenceClosure(evidenceRecords);
	const behaviorVersion = version(behaviorManifest);
	if (behaviorVersion !== version(resourceManifest)) throw new Error("P8.5 requires matching behavior and resource pack versions");
	const candidateId = `${behaviorVersion}-${artifact.sha256.slice(0, 12)}`;
	return {
		artifact: { path: artifact.path, sha256: artifact.sha256, sizeBytes: artifact.sizeBytes },
		candidateId,
		packs: { behaviorVersion, resourceVersion: version(resourceManifest) },
		platformReadiness: "pending_p8_6",
		schemaVersion: P8_5_STATIC_CANDIDATE_SCHEMA_VERSION,
		source: { commit: sourceCommit },
		staticEvidence: {
			acquisitionSources,
			behaviorContracts: behaviorEntries.length,
			coreEvidenceRecords,
			domainConclusions: p84Coverage,
			registrations: registrations.length,
			registrationStatuses: Object.fromEntries([...new Set(registrations.map(entry => entry.status))].sort().map(status => [status, registrations.filter(entry => entry.status === status).length]))
		},
		staticState: "static_verified"
	};
}

function sourceCommit(bedrockRoot) {
	const result = spawnSync("git", ["-C", resolve(bedrockRoot, ".."), "rev-parse", "HEAD"], { encoding: "utf8" });
	if (result.status !== 0 || !/^[a-f0-9]{40}\n?$/.test(result.stdout))
		throw new Error("P8.5 requires a resolvable Git source commit");
	return result.stdout.trim();
}

function run(bedrockRoot, file) {
	const result = spawnSync(process.execPath, [resolve(toolDirectory, file)], { cwd: bedrockRoot, stdio: "inherit" });
	if (result.status !== 0) throw new Error(`P8.5 prerequisite failed: ${file}`);
}

export async function createP85StaticCandidate({ bedrockRoot = defaultBedrockRoot, verify = true } = {}) {
	if (verify) { run(bedrockRoot, "run-tests.mjs"); run(bedrockRoot, "validate-packs.mjs"); run(bedrockRoot, "build.mjs"); }
	const data = name => readFile(resolve(bedrockRoot, "data", name), "utf8").then(JSON.parse);
	const [acquisitionLedger, behaviorManifest, gapLedger, javaBehaviorInventory, migrationLedger, p84, parityEvidenceLedger, resourceManifest] = await Promise.all([
		data("p7-1-acquisition-ledger.json"), readFile(resolve(bedrockRoot, "build", "behavior_pack", "manifest.json"), "utf8").then(JSON.parse), data("p7-7-gap-ledger.json"), data("java-behavior-inventory.json"), data("migration-ledger.json"), data("p8-4-domain-convergence.json"), data("p8-parity-evidence-ledger.json"), readFile(resolve(bedrockRoot, "build", "resource_pack", "manifest.json"), "utf8").then(JSON.parse)
	]);
	const artifact = await createPackArchive({ bedrockRoot });
	const candidate = buildP85StaticCandidate({ acquisitionLedger, artifact, behaviorManifest, gapLedger, javaBehaviorInventory, migrationLedger, p84, parityEvidenceLedger, resourceManifest, sourceCommit: sourceCommit(bedrockRoot) });
	const report = resolve(bedrockRoot, "dist", `p8-5-${candidate.candidateId}.json`);
	await mkdir(dirname(report), { recursive: true });
	await writeFile(report, `${JSON.stringify(candidate, null, 2)}\n`);
	return { candidate, report };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
	const { candidate, report } = await createP85StaticCandidate();
	console.log(`P8.5 static candidate ${candidate.candidateId}: ${candidate.artifact.path}; report ${report}`);
}
