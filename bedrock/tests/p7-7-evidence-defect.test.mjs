import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { appendP77Campaign, recordP77AcceptanceRun, resolveP77Defect } from "../tools/p7-7-acceptance-schema.mjs";
import { buildP77CandidateDocument } from "../tools/p7-7-candidate-schema.mjs";
import { applyP77ContentLog, buildP77ReportTemplate, collectP77Evidence, parseP77ContentLog } from "../tools/p7-7-evidence-lifecycle.mjs";
import { recordP77Result } from "../tools/record-p7-7-result.mjs";

const bedrockRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function json(file) { return JSON.parse(await readFile(file, "utf8")); }
async function writeJson(file, value) { await writeFile(file, `${JSON.stringify(value, null, 2)}\n`); }

async function fixtures() {
	const [behaviorManifest, resourceManifest, catalog] = await Promise.all([
		json(resolve(bedrockRoot, "behavior_pack", "manifest.json")),
		json(resolve(bedrockRoot, "resource_pack", "manifest.json")),
		json(resolve(bedrockRoot, "data", "p7-7-scenario-catalog.json"))
	]);
	const build = commit => buildP77CandidateDocument({
		commit,
		createdAt: "2026-07-27T00:00:00.000Z",
		tree: { sha256: "b".repeat(64), files: 10, bytes: 100 },
		artifact: { path: `bedrock/dist/createbedrock-${behaviorManifest.header.version.join(".")}-${"c".repeat(12)}.mcaddon`, sha256: "c".repeat(64), sizeBytes: 200 },
		behaviorManifest,
		resourceManifest
	});
	return {
		candidate: build("a".repeat(40)),
		candidateB: build("d".repeat(40)),
		catalog,
		ledger: { schemaVersion: 1, currentCandidateId: null, outcome: "pending_candidate", campaigns: [], defects: [] }
	};
}

function completedReport(candidate, catalog) {
	const report = buildP77ReportTemplate({ candidate, catalog, platformId: "windows_bedrock", scenarioId: "candidate_identity", runId: "windows-candidate-001" });
	Object.assign(report, {
		state: "passed",
		startedAt: "2026-07-27T01:00:00.000Z",
		endedAt: "2026-07-27T01:01:00.000Z",
		bedrockVersion: "1.26.0",
		device: "Windows test device",
		inputMode: "keyboard_mouse",
		accountAliases: ["tester-a"],
		worldSeed: "p7-7-fixture",
		observed: "Candidate identity matches the imported archive.",
		observedCandidate: {
			candidateId: candidate.candidateId,
			archiveSha256: candidate.artifact.sha256,
			behaviorUuid: candidate.packs.behavior.uuid,
			resourceUuid: candidate.packs.resource.uuid,
			behaviorVersion: candidate.packs.behavior.version,
			resourceVersion: candidate.packs.resource.version
		}
	});
	return report;
}

test("P7.7 evidence workflow hashes redacted observations and rejects tampering", async () => {
	const { candidate, catalog } = await fixtures();
	const root = await mkdtemp(resolve(tmpdir(), "p77-evidence-"));
	try {
		const report = completedReport(candidate, catalog);
		const reportFile = resolve(root, report.reportPath);
		const observation = resolve(dirname(reportFile), "observation.txt");
		await mkdir(dirname(reportFile), { recursive: true });
		await writeJson(reportFile, report);
		await writeFile(observation, "candidate identity observed\n");
		const collected = await collectP77Evidence({ reportFile, repositoryRoot: root });
		assert.equal(collected.files, 1);
		assert.match(await readFile(resolve(dirname(reportFile), "files.sha256"), "utf8"), /observation\.txt/);
		await writeFile(observation, "tampered\n");
		const campaign = appendP77Campaign({ schemaVersion: 1, currentCandidateId: null, outcome: "pending_candidate", campaigns: [], defects: [] }, candidate, catalog);
		const dataRoot = resolve(root, "bedrock", "data");
		await mkdir(dataRoot, { recursive: true });
		await Promise.all([
			writeJson(resolve(dataRoot, "p7-7-candidate.json"), candidate),
			writeJson(resolve(dataRoot, "p7-7-scenario-catalog.json"), catalog),
			writeJson(resolve(dataRoot, "p7-7-acceptance.json"), campaign)
		]);
		const persistedReport = await json(reportFile);
		await assert.rejects(() => recordP77Result({
			report: persistedReport, reportFile, bedrockRoot: resolve(root, "bedrock"), repositoryRoot: root
		}), /evidence digest changed/);
		assert.throws(() => buildP77ReportTemplate({ candidate, catalog, platformId: "windows_bedrock", scenarioId: "candidate_identity", runId: "User Name" }), /run ID/);
		assert.ok(campaign.campaigns.length === 1);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("P7.7 Content Log parser requires a boot marker and explicit warning allowlist", async () => {
	const parsed = parseP77ContentLog("[Create Bedrock] Kernel started\nWarning: expected test warning\n", { warningAllowlist: ["expected test warning"] });
	assert.deepEqual({ ...parsed, unallowlistedWarnings: [] }, { ...parsed, unallowlistedWarnings: [] });
	assert.equal(parsed.scriptBootMarkerCount, 1);
	assert.equal(parsed.contentLogErrorCount, 0);
	assert.equal(parsed.warningsAllowlisted, true);
	assert.equal(parseP77ContentLog("Error: pack failed\n").contentLogErrorCount, 1);
});

test("P7.7 defect lifecycle rejects P0-P2 acceptance and closes only on a newer candidate", async () => {
	const { candidate, candidateB, catalog, ledger } = await fixtures();
	let next = appendP77Campaign(ledger, candidate, catalog);
	const failed = completedReport(candidate, catalog);
	failed.runId = "windows-kinetics-001";
	failed.scenarioId = "kinetics_network";
	failed.state = "failed";
	failed.issue = { id: "P77-P1-1", severity: "P1", summary: "Kinetic transfer failed" };
	failed.evidence = [{ path: `work/evidence/p7-7/${candidate.candidateId}/windows_bedrock/${failed.runId}/observation.txt`, sha256: "e".repeat(64) }];
	failed.reportPath = `work/evidence/p7-7/${candidate.candidateId}/windows_bedrock/${failed.runId}/report.json`;
	delete failed.observedCandidate;
	next = recordP77AcceptanceRun(next, failed, { candidate, catalog });
	assert.throws(() => resolveP77Defect(next, {
		defectId: "P77-P1-1", state: "accepted", resolution: "Ignore it", resolutionCandidateId: candidate.candidateId, closedAt: "2026-07-27T02:00:00.000Z"
	}, { candidate, catalog }), /only P3/);
	next = appendP77Campaign(next, candidateB, catalog, { previousCandidate: candidate });
	assert.equal(next.campaigns[0].supersededByCandidateId, candidateB.candidateId);
	const closed = resolveP77Defect(next, {
		defectId: "P77-P1-1", state: "closed", resolution: "Fixed and queued for retest", resolutionCandidateId: candidateB.candidateId, closedAt: "2026-07-27T02:00:00.000Z"
	}, { candidate: candidateB, catalog });
	assert.equal(closed.defects[0].state, "closed");
	assert.equal(closed.defects[0].resolutionCandidateId, candidateB.candidateId);
});
