import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
	appendP77Campaign,
	deriveS315CompatibilityLedger,
	recordP77AcceptanceRun,
	summarizeP77Acceptance,
	validateP77AcceptanceDocument,
	validateP77ScenarioCatalog
} from "../tools/p7-7-acceptance-schema.mjs";
import {
	buildP77CandidateDocument,
	hashPackTree,
	validateP77CandidateDocument
} from "../tools/p7-7-candidate-schema.mjs";
import { validateP77StaticContract } from "../tools/p7-7-static-contract.mjs";
import { createPackArchive, sha256File } from "../tools/pack.mjs";
import { recordP77Result } from "../tools/record-p7-7-result.mjs";
import { createP77Candidate } from "../tools/create-p7-7-candidate.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(testDirectory, "..");

async function json(file) {
	return JSON.parse(await readFile(file, "utf8"));
}

async function writeJson(file, value) {
	await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function fixtures() {
	const [behaviorManifest, resourceManifest, catalog] = await Promise.all([
		json(resolve(bedrockRoot, "behavior_pack", "manifest.json")),
		json(resolve(bedrockRoot, "resource_pack", "manifest.json")),
		json(resolve(bedrockRoot, "data", "p7-7-scenario-catalog.json"))
	]);
	const ledger = {
		schemaVersion: 1,
		currentCandidateId: null,
		outcome: "pending_candidate",
		campaigns: [],
		defects: []
	};
	const candidate = buildP77CandidateDocument({
		commit: "a".repeat(40),
		createdAt: "2026-07-23T00:00:00.000Z",
		tree: { sha256: "b".repeat(64), files: 10, bytes: 100 },
		artifact: {
			path: `bedrock/dist/createbedrock-${behaviorManifest.header.version.join(".")}-${"c".repeat(12)}.mcaddon`,
			sha256: "c".repeat(64),
			sizeBytes: 200
		},
		behaviorManifest,
		resourceManifest
	});
	return { behaviorManifest, resourceManifest, candidate, catalog, ledger };
}

function runFor(candidate, {
	platformId = "windows_bedrock",
	scenarioId = "candidate_identity",
	runId = `${platformId}-${scenarioId}-001`,
	state = "passed"
} = {}) {
	const run = {
		runId,
		candidateId: candidate.candidateId,
		platformId,
		scenarioId,
		state,
		startedAt: "2026-07-23T01:00:00.000Z",
		endedAt: "2026-07-23T01:01:00.000Z",
		bedrockVersion: "1.26.0",
		device: platformId === "playstation" ? "PlayStation test console" : "Windows test device",
		inputMode: platformId === "playstation" ? "controller" : "keyboard_mouse",
		accountAliases: ["tester-a"],
		worldSeed: "p7-7-fixture",
		realmSlot: platformId === "windows_bedrock" ? null : "test-slot-a",
		playerCount: 1,
		durationMinutes: 1,
		steps: ["Load the frozen candidate", "Exercise the scenario assertions"],
		expected: "The scenario meets every catalog assertion.",
		observed: state === "passed" ? "All assertions passed." : "A blocking mismatch occurred.",
		reportPath: `work/evidence/p7-7/${candidate.candidateId}/${platformId}/${runId}/report.json`,
		evidence: [{
			path: `work/evidence/p7-7/${candidate.candidateId}/${platformId}/${runId}/observation.txt`,
			sha256: "d".repeat(64)
		}],
		diagnostics: { before: null, after: null },
		metrics: {},
		issue: state === "failed"
			? { id: "P77-FIXTURE-1", severity: "P1", summary: "Fixture failure" }
			: null
	};
	if (scenarioId === "candidate_identity")
		run.observedCandidate = {
			candidateId: candidate.candidateId,
			archiveSha256: candidate.artifact.sha256,
			behaviorUuid: candidate.packs.behavior.uuid,
			resourceUuid: candidate.packs.resource.uuid,
			behaviorVersion: candidate.packs.behavior.version,
			resourceVersion: candidate.packs.resource.version
		};
	if (scenarioId === "content_log_script_boot")
		run.metrics = {
			scriptBootMarkerCount: 1,
			contentLogErrorCount: 0,
			contentLogWarningCount: 0,
			warningsAllowlisted: false
		};
	if (scenarioId === "two_player_concurrency") {
		run.playerCount = 2;
		run.accountAliases = ["tester-a", "tester-b"];
	}
	if (scenarioId === "stress_30_minutes") {
		run.playerCount = 2;
		run.accountAliases = ["tester-a", "tester-b"];
		run.durationMinutes = 30;
		run.metrics = {
			kernelFailed: 0,
			kernelPendingBaseline: 1,
			kernelPendingAfter60Seconds: 1,
			crashCount: 0,
			watchdogCount: 0,
			unrecoverableDisconnectCount: 0,
			schedulerDeferredGrowthBounded: true,
			dynamicPropertyBytesFirstWindow: 100,
			dynamicPropertyBytesSecondWindow: 125
		};
	}
	return run;
}

test("P7.7 static contract keeps all physical checks pending before and after candidate freeze", async () => {
	const [report, gapLedger] = await Promise.all([
		validateP77StaticContract(),
		json(resolve(bedrockRoot, "data", "p7-7-gap-ledger.json"))
	]);
	assert.equal(report.scenarios, 18);
	assert.equal(report.applicableChecks, 52);
	assert.ok(["uncreated", "frozen"].includes(report.candidateState));
	assert.equal(report.outcome, report.candidateState === "frozen"
		? "pending_platform_validation"
		: "pending_candidate");
	assert.equal(report.runs, 0);
	assert.equal(report.staticClosure.ready, true);
	assert.equal(report.staticClosure.coreAuditGaps, gapLedger.summary.classifications.core_audit_required);
	assert.equal(report.staticClosure.coreImplementationGaps, gapLedger.summary.classifications.core_implementation_required);
});

test("P7.7 catalog rejects ownership and platform coverage drift", async () => {
	const { catalog } = await fixtures();
	assert.deepEqual(validateP77ScenarioCatalog(catalog), {
		platforms: 3,
		scenarios: 18,
		applicableChecks: 52
	});
	const drifted = structuredClone(catalog);
	drifted.scenarios[0].applicability.playstation = "sampled";
	assert.throws(() => validateP77ScenarioCatalog(drifted), /wrong playstation applicability/);
});

test("P7.7 candidate identity binds commit, normalized pack tree, manifests, and archive digest", async () => {
	const { behaviorManifest, resourceManifest, candidate } = await fixtures();
	assert.equal(validateP77CandidateDocument(candidate, { behaviorManifest, resourceManifest }).candidateId, candidate.candidateId);
	const changed = structuredClone(candidate);
	changed.artifact.sha256 = "e".repeat(64);
	assert.throws(() => validateP77CandidateDocument(changed), /archive path must be/);

	const root = await mkdtemp(resolve(tmpdir(), "p77-tree-"));
	try {
		const behavior = resolve(root, "behavior_pack");
		const resource = resolve(root, "resource_pack");
		await mkdir(resolve(behavior, "scripts"), { recursive: true });
		await mkdir(resolve(resource, "textures"), { recursive: true });
		await writeFile(resolve(behavior, "scripts", "main.js"), "export {};\n");
		await writeFile(resolve(resource, "textures", "atlas.json"), "{}\n");
		const first = await hashPackTree({ behaviorRoot: behavior, resourceRoot: resource });
		const second = await hashPackTree({ behaviorRoot: behavior, resourceRoot: resource });
		assert.deepEqual(first, second);
		await writeFile(resolve(resource, "textures", "atlas.json"), "{\"changed\":true}\n");
		assert.notEqual((await hashPackTree({ behaviorRoot: behavior, resourceRoot: resource })).sha256, first.sha256);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("P7.7 packer emits a digest-named immutable mcaddon", async () => {
	const root = await mkdtemp(resolve(tmpdir(), "p77-pack-"));
	try {
		const behavior = resolve(root, "build", "behavior_pack");
		const resource = resolve(root, "build", "resource_pack");
		await mkdir(behavior, { recursive: true });
		await mkdir(resource, { recursive: true });
		await writeFile(resolve(behavior, "manifest.json"), JSON.stringify({ header: { version: [1, 2, 3] } }));
		await writeFile(resolve(resource, "manifest.json"), "{}\n");
		const artifact = await createPackArchive({ bedrockRoot: root });
		assert.match(artifact.archive, /createbedrock-1\.2\.3-[0-9a-f]{12}\.mcaddon$/);
		assert.equal(await sha256File(artifact.archive), artifact.sha256);
		assert.ok(artifact.sizeBytes > 0);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("P7.7 candidate creator freezes a clean Git source and opens one pending campaign", async () => {
	const { behaviorManifest, resourceManifest, catalog, ledger } = await fixtures();
	const root = await mkdtemp(resolve(tmpdir(), "p77-candidate-"));
	try {
		const temporaryBedrock = resolve(root, "bedrock");
		const dataRoot = resolve(temporaryBedrock, "data");
		const behavior = resolve(temporaryBedrock, "build", "behavior_pack");
		const resource = resolve(temporaryBedrock, "build", "resource_pack");
		await mkdir(dataRoot, { recursive: true });
		await mkdir(behavior, { recursive: true });
		await mkdir(resource, { recursive: true });
		await Promise.all([
			writeJson(resolve(dataRoot, "p7-7-candidate.json"), {
				schemaVersion: 1,
				state: "uncreated",
				target: catalog.target,
				candidateId: null,
				createdAt: null,
				source: null,
				packs: null,
				artifact: null
			}),
			writeJson(resolve(dataRoot, "p7-7-scenario-catalog.json"), catalog),
			writeJson(resolve(dataRoot, "p7-7-acceptance.json"), ledger),
			writeJson(resolve(behavior, "manifest.json"), behaviorManifest),
			writeJson(resolve(resource, "manifest.json"), resourceManifest),
			writeFile(resolve(behavior, "payload.txt"), "behavior\n"),
			writeFile(resolve(resource, "payload.txt"), "resource\n")
		]);
		for (const args of [
			["init", "-q"],
			["config", "user.email", "p77@example.invalid"],
			["config", "user.name", "P7.7 Test"],
			["add", "."],
			["commit", "-q", "-m", "fixture"]
		]) {
			const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
			assert.equal(result.status, 0, result.stderr);
		}
		const result = await createP77Candidate({
			bedrockRoot: temporaryBedrock,
			repositoryRoot: root,
			createdAt: "2026-07-23T02:00:00.000Z",
			build: false
		});
		assert.equal(result.candidate.state, "frozen");
		assert.equal(result.ledger.currentCandidateId, result.candidate.candidateId);
		assert.equal(result.ledger.campaigns.length, 1);
		assert.equal(result.ledger.outcome, "pending_platform_validation");
		assert.equal(await sha256File(result.artifact.archive), result.candidate.artifact.sha256);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("P7.7 campaign starts with 52 pending checks and derives the legacy S3-15 ledger", async () => {
	const { candidate, catalog, ledger } = await fixtures();
	const campaignLedger = appendP77Campaign(ledger, candidate, catalog);
	const coverage = validateP77AcceptanceDocument(campaignLedger, { candidate, catalog });
	assert.equal(coverage.campaigns, 1);
	assert.equal(coverage.runs, 0);
	assert.equal(coverage.outcome, "pending_platform_validation");
	const summary = summarizeP77Acceptance({ candidate, catalog, ledger: campaignLedger });
	assert.deepEqual(summary.platforms.map(platform => platform.applicable), [17, 18, 17]);
	const legacy = deriveS315CompatibilityLedger({ candidate, catalog, ledger: campaignLedger });
	assert.equal(legacy.outcome, "pending_platform_validation");
	assert.ok(legacy.platforms.every(platform => platform.state === "pending"));
});

test("P7.7 records immutable evidence-backed runs and rejects overwrite or candidate drift", async () => {
	const { candidate, catalog, ledger } = await fixtures();
	const campaignLedger = appendP77Campaign(ledger, candidate, catalog);
	const run = runFor(candidate);
	const recorded = recordP77AcceptanceRun(campaignLedger, run, { candidate, catalog });
	assert.equal(recorded.campaigns[0].platforms[0].runs.length, 1);
	assert.equal(recorded.campaigns[0].platforms[0].scenarios[0].state, "passed");
	assert.throws(
		() => recordP77AcceptanceRun(recorded, run, { candidate, catalog }),
		/cannot be overwritten/
	);
	const drifted = runFor(candidate, { runId: "candidate-drift-001" });
	drifted.observedCandidate.archiveSha256 = "f".repeat(64);
	assert.throws(
		() => recordP77AcceptanceRun(campaignLedger, drifted, { candidate, catalog }),
		/different candidate identity/
	);
});

test("P7.7 file recorder verifies evidence hashes and updates both ledgers", async () => {
	const { candidate, catalog, ledger } = await fixtures();
	const campaignLedger = appendP77Campaign(ledger, candidate, catalog);
	const root = await mkdtemp(resolve(tmpdir(), "p77-record-"));
	try {
		const dataRoot = resolve(root, "bedrock", "data");
		await mkdir(dataRoot, { recursive: true });
		await Promise.all([
			writeJson(resolve(dataRoot, "p7-7-candidate.json"), candidate),
			writeJson(resolve(dataRoot, "p7-7-scenario-catalog.json"), catalog),
			writeJson(resolve(dataRoot, "p7-7-acceptance.json"), campaignLedger)
		]);
		const run = runFor(candidate);
		const reportFile = resolve(root, run.reportPath);
		const observationFile = resolve(root, run.evidence[0].path);
		await mkdir(dirname(reportFile), { recursive: true });
		await writeFile(observationFile, "candidate identity observed\n");
		run.evidence[0].sha256 = await sha256File(observationFile);
		await writeJson(reportFile, run);
		await recordP77Result({
			report: run,
			reportFile,
			bedrockRoot: resolve(root, "bedrock"),
			repositoryRoot: root
		});
		const recorded = await json(resolve(dataRoot, "p7-7-acceptance.json"));
		assert.equal(recorded.campaigns[0].platforms[0].runs.length, 1);
		const legacy = await json(resolve(dataRoot, "s3-15-platform-acceptance.json"));
		assert.equal(legacy.platforms[0].scenarios[0].state, "pending");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("P7.7 enforces Content Log, two-player, stress, and failed-run defect gates", async () => {
	const { candidate, catalog, ledger } = await fixtures();
	const campaignLedger = appendP77Campaign(ledger, candidate, catalog);
	const warning = runFor(candidate, { scenarioId: "content_log_script_boot" });
	warning.metrics.contentLogWarningCount = 1;
	assert.throws(
		() => recordP77AcceptanceRun(campaignLedger, warning, { candidate, catalog }),
		/allowlist every warning/
	);
	const concurrency = runFor(candidate, { scenarioId: "two_player_concurrency" });
	concurrency.playerCount = 1;
	concurrency.accountAliases = ["tester-a"];
	assert.throws(
		() => recordP77AcceptanceRun(campaignLedger, concurrency, { candidate, catalog }),
		/player gate/
	);
	const stress = runFor(candidate, { scenarioId: "stress_30_minutes" });
	stress.metrics.dynamicPropertyBytesSecondWindow = 126;
	assert.throws(
		() => recordP77AcceptanceRun(campaignLedger, stress, { candidate, catalog }),
		/dynamic-property growth gate/
	);
	const failed = runFor(candidate, { scenarioId: "kinetics_network", state: "failed" });
	const recorded = recordP77AcceptanceRun(campaignLedger, failed, { candidate, catalog });
	assert.equal(recorded.outcome, "failed_platform_validation");
	assert.equal(recorded.defects[0].state, "open");
});
