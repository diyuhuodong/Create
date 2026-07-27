import { hasCompatibilityEngineVersion, REDSTONE_COMPATIBILITY_TARGET } from "../behavior_pack/scripts/redstone/redstone-target.js";
import { validateP77CandidateDocument } from "./p7-7-candidate-schema.mjs";

export const P77_PLATFORM_IDS = Object.freeze(["windows_bedrock", "test_realm", "playstation"]);
export const P77_SCENARIO_RULES = Object.freeze([
	Object.freeze({ id: "candidate_identity", owner: "P7.7", applicability: ["required", "required", "required"] }),
	Object.freeze({ id: "pack_import_dependencies", owner: "P7.7", applicability: ["required", "required", "sampled"] }),
	Object.freeze({ id: "content_log_script_boot", owner: "P7.7", applicability: ["required", "sampled", "not_applicable"] }),
	Object.freeze({ id: "content_acquisition", owner: "P7.1", applicability: ["required", "sampled", "sampled"] }),
	Object.freeze({ id: "language_guide", owner: "P7.1/P7.6", applicability: ["required", "sampled", "required"] }),
	Object.freeze({ id: "recipes_processing", owner: "P7.2", applicability: ["required", "sampled", "sampled"] }),
	Object.freeze({ id: "fluids_heat", owner: "P7.3", applicability: ["required", "required", "sampled"] }),
	Object.freeze({ id: "kinetics_network", owner: "P7.4", applicability: ["required", "required", "required"] }),
	Object.freeze({ id: "redstone_controls", owner: "P7.4", applicability: ["required", "required", "required"] }),
	Object.freeze({ id: "logistics_packages", owner: "P7.4", applicability: ["required", "required", "sampled"] }),
	Object.freeze({ id: "contraptions_schematics", owner: "P7.5", applicability: ["required", "required", "required"] }),
	Object.freeze({ id: "trains_schedules", owner: "P7.5", applicability: ["required", "required", "required"] }),
	Object.freeze({ id: "equipment_tools", owner: "P7.6", applicability: ["required", "sampled", "required"] }),
	Object.freeze({ id: "visual_audio_particles", owner: "P7.6", applicability: ["required", "sampled", "required"] }),
	Object.freeze({ id: "restart_chunk_recovery", owner: "P7.2-P7.5", applicability: ["required", "required", "sampled"] }),
	Object.freeze({ id: "two_player_concurrency", owner: "P7.7", applicability: ["required", "required", "required"], minimumPlayers: 2 }),
	Object.freeze({ id: "realm_distribution_reconnect", owner: "P7.7", applicability: ["not_applicable", "required", "required"] }),
	Object.freeze({ id: "stress_30_minutes", owner: "P7.7", applicability: ["required", "required", "required"], minimumPlayers: 2, minimumDurationMinutes: 30 })
]);

const RUN_STATES = new Set(["passed", "failed"]);
const RESULT_STATES = new Set(["pending", "passed", "failed", "not_applicable"]);
const DEFECT_STATES = new Set(["open", "closed", "accepted"]);
const DEFECT_SEVERITIES = new Set(["P0", "P1", "P2", "P3"]);
const EVIDENCE_SHA_PATTERN = /^[0-9a-f]{64}$/;
const ACCOUNT_ALIAS_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;
const LEGACY_SCENARIO_RULES = Object.freeze([
	Object.freeze({ id: "pack_load_content_log", sources: ["candidate_identity", "pack_import_dependencies", "content_log_script_boot"] }),
	Object.freeze({ id: "diagnostics_summary", sources: ["candidate_identity", "content_log_script_boot", "stress_30_minutes"] }),
	Object.freeze({ id: "visual_resources", sources: ["language_guide", "visual_audio_particles"] }),
	Object.freeze({ id: "kinetics_processing_restart", sources: ["kinetics_network", "recipes_processing", "restart_chunk_recovery"] }),
	Object.freeze({ id: "redstone_controls", sources: ["redstone_controls"] }),
	Object.freeze({ id: "logistics_fluid_transactions", sources: ["logistics_packages", "fluids_heat"] }),
	Object.freeze({ id: "contraption_train_recovery", sources: ["contraptions_schematics", "trains_schedules", "restart_chunk_recovery"] }),
	Object.freeze({ id: "two_player_concurrency", sources: ["two_player_concurrency"], minimumPlayers: 2 }),
	Object.freeze({ id: "stress_30_minutes", sources: ["stress_30_minutes"], minimumPlayers: 2, minimumDurationMinutes: 30 })
]);

function assertObject(value, label) {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new TypeError(`P7.7 ${label} must be an object`);
}

function assertString(value, label) {
	if (typeof value !== "string" || value.trim().length === 0)
		throw new TypeError(`P7.7 ${label} must be a non-empty string`);
}

function assertExactIds(entries, expected, label) {
	if (!Array.isArray(entries) || entries.length !== expected.length)
		throw new Error(`P7.7 ${label} must contain exactly ${expected.length} entries`);
	const ids = entries.map(entry => entry?.id);
	if (new Set(ids).size !== ids.length || !expected.every(id => ids.includes(id)))
		throw new Error(`P7.7 ${label} must contain every required identifier exactly once`);
}

function assertIsoDate(value, label) {
	if (typeof value !== "string" || Number.isNaN(Date.parse(value)))
		throw new TypeError(`P7.7 ${label} must be an ISO date`);
}

function assertTarget(target) {
	assertObject(target, "scenario target");
	if (target.id !== REDSTONE_COMPATIBILITY_TARGET.id || !hasCompatibilityEngineVersion(target.minimumEngineVersion))
		throw new Error("P7.7 scenario catalog must retain the Realm/console 1.26.0 target");
}

export function validateP77ScenarioCatalog(catalog) {
	assertObject(catalog, "scenario catalog");
	if (catalog.schemaVersion !== 1)
		throw new Error("P7.7 scenario catalog must use schema version 1");
	assertTarget(catalog.target);
	assertExactIds(catalog.platforms, P77_PLATFORM_IDS, "platforms");
	for (const platform of catalog.platforms)
		assertString(platform.phase, `platform ${platform.id} phase`);
	assertExactIds(catalog.scenarios, P77_SCENARIO_RULES.map(rule => rule.id), "scenarios");
	for (const rule of P77_SCENARIO_RULES) {
		const scenario = catalog.scenarios.find(entry => entry.id === rule.id);
		assertObject(scenario, `scenario ${rule.id}`);
		if (scenario.owner !== rule.owner)
			throw new Error(`P7.7 scenario ${rule.id} must be owned by ${rule.owner}`);
		assertString(scenario.description, `scenario ${rule.id} description`);
		if (!Array.isArray(scenario.assertions) || scenario.assertions.length < 2)
			throw new Error(`P7.7 scenario ${rule.id} requires at least two assertions`);
		for (const assertion of scenario.assertions)
			assertString(assertion, `scenario ${rule.id} assertion`);
		assertObject(scenario.applicability, `scenario ${rule.id} applicability`);
		if (Object.keys(scenario.applicability).length !== P77_PLATFORM_IDS.length)
			throw new Error(`P7.7 scenario ${rule.id} must classify every platform`);
		for (const [index, platformId] of P77_PLATFORM_IDS.entries())
			if (scenario.applicability[platformId] !== rule.applicability[index])
				throw new Error(`P7.7 scenario ${rule.id} has the wrong ${platformId} applicability`);
		if ((scenario.minimumPlayers ?? null) !== (rule.minimumPlayers ?? null)
			|| (scenario.minimumDurationMinutes ?? null) !== (rule.minimumDurationMinutes ?? null))
			throw new Error(`P7.7 scenario ${rule.id} has the wrong player or duration gate`);
	}
	return {
		platforms: P77_PLATFORM_IDS.length,
		scenarios: P77_SCENARIO_RULES.length,
		applicableChecks: catalog.scenarios.reduce((count, scenario) =>
			count + Object.values(scenario.applicability).filter(value => value !== "not_applicable").length, 0)
	};
}

function validateEvidence(evidence, run) {
	if (!Array.isArray(evidence) || evidence.length === 0)
		throw new Error(`P7.7 run ${run.runId} requires hashed evidence`);
	const prefix = `work/evidence/p7-7/${run.candidateId}/${run.platformId}/${run.runId}/`;
	for (const item of evidence) {
		assertObject(item, `run ${run.runId} evidence`);
		if (typeof item.path !== "string" || !item.path.startsWith(prefix) || item.path.includes(".."))
			throw new Error(`P7.7 run ${run.runId} evidence must stay below ${prefix}`);
		if (!EVIDENCE_SHA_PATTERN.test(item.sha256))
			throw new Error(`P7.7 run ${run.runId} evidence requires a SHA-256 digest`);
	}
}

function validateCandidateObservation(run, candidate) {
	assertObject(run.observedCandidate, `run ${run.runId} observed candidate`);
	const observed = run.observedCandidate;
	if (observed.candidateId !== candidate.candidateId
		|| observed.archiveSha256 !== candidate.artifact.sha256
		|| observed.behaviorUuid !== candidate.packs.behavior.uuid
		|| observed.resourceUuid !== candidate.packs.resource.uuid
		|| JSON.stringify(observed.behaviorVersion) !== JSON.stringify(candidate.packs.behavior.version)
		|| JSON.stringify(observed.resourceVersion) !== JSON.stringify(candidate.packs.resource.version))
		throw new Error(`P7.7 run ${run.runId} observed a different candidate identity`);
}

function validateContentLogMetrics(run) {
	assertObject(run.metrics, `run ${run.runId} metrics`);
	if (!Number.isInteger(run.metrics.scriptBootMarkerCount) || run.metrics.scriptBootMarkerCount < 1)
		throw new Error(`P7.7 Content Log run ${run.runId} requires a Create Bedrock script boot marker`);
	if (run.metrics.contentLogErrorCount !== 0)
		throw new Error(`P7.7 passed Content Log run ${run.runId} must report zero errors`);
	if (!Number.isInteger(run.metrics.contentLogWarningCount) || run.metrics.contentLogWarningCount < 0)
		throw new Error(`P7.7 Content Log run ${run.runId} requires a warning count`);
	if (run.metrics.contentLogWarningCount > 0 && run.metrics.warningsAllowlisted !== true)
		throw new Error(`P7.7 Content Log run ${run.runId} must allowlist every warning`);
}

function validateStressMetrics(run) {
	assertObject(run.metrics, `run ${run.runId} metrics`);
	for (const metric of ["kernelFailed", "kernelPendingBaseline", "kernelPendingAfter60Seconds", "crashCount", "watchdogCount", "unrecoverableDisconnectCount"])
		if (!Number.isInteger(run.metrics[metric]) || run.metrics[metric] < 0)
			throw new Error(`P7.7 stress run ${run.runId} requires non-negative integer ${metric}`);
	if (run.metrics.kernelFailed !== 0
		|| run.metrics.kernelPendingAfter60Seconds > run.metrics.kernelPendingBaseline
		|| run.metrics.crashCount !== 0
		|| run.metrics.watchdogCount !== 0
		|| run.metrics.unrecoverableDisconnectCount !== 0
		|| run.metrics.schedulerDeferredGrowthBounded !== true)
		throw new Error(`P7.7 stress run ${run.runId} violates a stability gate`);
	for (const metric of ["dynamicPropertyBytesFirstWindow", "dynamicPropertyBytesSecondWindow"])
		if (!Number.isInteger(run.metrics[metric]) || run.metrics[metric] < 0)
			throw new Error(`P7.7 stress run ${run.runId} requires non-negative integer ${metric}`);
	const first = run.metrics.dynamicPropertyBytesFirstWindow;
	const allowedSecond = first === 0 ? 0 : Math.ceil(first * 1.25);
	if (run.metrics.dynamicPropertyBytesSecondWindow > allowedSecond)
		throw new Error(`P7.7 stress run ${run.runId} exceeds the dynamic-property growth gate`);
}

function validateRun(run, { candidate, catalog, platformId }) {
	assertObject(run, "acceptance run");
	for (const field of ["runId", "candidateId", "platformId", "scenarioId", "bedrockVersion", "device", "inputMode", "worldSeed", "expected", "observed", "reportPath"])
		assertString(run[field], `run ${run.runId ?? "unknown"} ${field}`);
	if (run.candidateId !== candidate.candidateId || run.platformId !== platformId)
		throw new Error(`P7.7 run ${run.runId} does not belong to its candidate campaign and platform`);
	if (!RUN_STATES.has(run.state))
		throw new Error(`P7.7 run ${run.runId} must be passed or failed`);
	const scenario = catalog.scenarios.find(entry => entry.id === run.scenarioId);
	if (!scenario || scenario.applicability[platformId] === "not_applicable")
		throw new Error(`P7.7 run ${run.runId} targets an unavailable scenario`);
	assertIsoDate(run.startedAt, `run ${run.runId} start`);
	assertIsoDate(run.endedAt, `run ${run.runId} end`);
	if (Date.parse(run.endedAt) < Date.parse(run.startedAt))
		throw new Error(`P7.7 run ${run.runId} ends before it starts`);
	if (!Number.isInteger(run.playerCount) || run.playerCount < (scenario.minimumPlayers ?? 1))
		throw new Error(`P7.7 run ${run.runId} does not meet the player gate`);
	if (typeof run.durationMinutes !== "number" || run.durationMinutes < (scenario.minimumDurationMinutes ?? 0))
		throw new Error(`P7.7 run ${run.runId} does not meet the duration gate`);
	if (!Array.isArray(run.accountAliases) || run.accountAliases.length !== run.playerCount)
		throw new Error(`P7.7 run ${run.runId} requires one sanitized account alias per player`);
	for (const alias of run.accountAliases)
		if (typeof alias !== "string" || !ACCOUNT_ALIAS_PATTERN.test(alias))
			throw new Error(`P7.7 run ${run.runId} account alias must be a sanitized alias`);
	if (!Array.isArray(run.steps) || run.steps.length === 0)
		throw new Error(`P7.7 run ${run.runId} requires executed steps`);
	for (const step of run.steps)
		assertString(step, `run ${run.runId} step`);
	if (platformId === "windows_bedrock" && run.realmSlot !== null)
		throw new Error(`P7.7 Windows run ${run.runId} must not claim a Realm slot`);
	if (platformId !== "windows_bedrock")
		assertString(run.realmSlot, `run ${run.runId} Realm slot alias`);
	assertObject(run.diagnostics, `run ${run.runId} diagnostics`);
	for (const field of ["before", "after"])
		if (run.diagnostics[field] !== null)
			assertString(run.diagnostics[field], `run ${run.runId} diagnostics ${field}`);
	const expectedReport = `work/evidence/p7-7/${run.candidateId}/${run.platformId}/${run.runId}/report.json`;
	if (run.reportPath !== expectedReport)
		throw new Error(`P7.7 run ${run.runId} report path must be ${expectedReport}`);
	validateEvidence(run.evidence, run);
	if (run.state === "failed") {
		assertObject(run.issue, `failed run ${run.runId} issue`);
		assertString(run.issue.id, `failed run ${run.runId} issue ID`);
		assertString(run.issue.summary, `failed run ${run.runId} issue summary`);
		if (!DEFECT_SEVERITIES.has(run.issue.severity))
			throw new Error(`P7.7 failed run ${run.runId} requires a P0-P3 severity`);
	} else if (run.issue !== null) {
		throw new Error(`P7.7 passed run ${run.runId} must not claim an issue`);
	}
	if (run.state === "passed" && run.scenarioId === "candidate_identity")
		validateCandidateObservation(run, candidate);
	if (run.state === "passed" && run.scenarioId === "content_log_script_boot")
		validateContentLogMetrics(run);
	if (run.state === "passed" && run.scenarioId === "stress_30_minutes")
		validateStressMetrics(run);
}

function expectedScenarioSummaries(catalog, platformId) {
	return catalog.scenarios.map(scenario => {
		const requirement = scenario.applicability[platformId];
		return {
			id: scenario.id,
			requirement,
			state: requirement === "not_applicable" ? "not_applicable" : "pending",
			latestRunId: null
		};
	});
}

export function createP77Campaign(candidate, catalog) {
	validateP77CandidateDocument(candidate);
	validateP77ScenarioCatalog(catalog);
	if (candidate.state !== "frozen")
		throw new Error("P7.7 cannot create an acceptance campaign before freezing a candidate");
	return {
		candidateId: candidate.candidateId,
		createdAt: candidate.createdAt,
		state: "pending",
		platforms: P77_PLATFORM_IDS.map(id => ({
			id,
			state: "pending",
			scenarios: expectedScenarioSummaries(catalog, id),
			runs: []
		}))
	};
}

function derivedResultState(results) {
	if (results.some(result => result.state === "failed"))
		return "failed";
	if (results.length > 0 && results.every(result => result.state === "passed"))
		return "passed";
	return "pending";
}

function blockingDefects(defects, candidateId) {
	return defects.filter(defect =>
		defect.candidateId === candidateId
		&& defect.state === "open"
		&& defect.severity !== "P3");
}

function validateDefects(defects, campaignIds) {
	if (!Array.isArray(defects))
		throw new TypeError("P7.7 defects must be an array");
	const ids = new Set();
	for (const defect of defects) {
		assertObject(defect, "defect");
		for (const field of ["id", "candidateId", "summary", "openedAt"])
			assertString(defect[field], `defect ${defect.id ?? "unknown"} ${field}`);
		if (ids.has(defect.id))
			throw new Error(`P7.7 defect ${defect.id} is duplicated`);
		ids.add(defect.id);
		if (!campaignIds.has(defect.candidateId))
			throw new Error(`P7.7 defect ${defect.id} references an unknown candidate`);
		if (!DEFECT_SEVERITIES.has(defect.severity) || !DEFECT_STATES.has(defect.state))
			throw new Error(`P7.7 defect ${defect.id} has an invalid severity or state`);
		assertIsoDate(defect.openedAt, `defect ${defect.id} openedAt`);
		if (defect.state === "closed") {
			assertIsoDate(defect.closedAt, `defect ${defect.id} closedAt`);
			assertString(defect.resolution, `defect ${defect.id} resolution`);
			assertString(defect.resolutionCandidateId, `defect ${defect.id} resolution candidate`);
			if (!campaignIds.has(defect.resolutionCandidateId) || defect.resolutionCandidateId === defect.candidateId)
				throw new Error(`P7.7 closed defect ${defect.id} must name a newer frozen candidate`);
		} else if (defect.state === "accepted") {
			if (defect.severity !== "P3")
				throw new Error(`P7.7 only P3 defects may be accepted`);
			assertString(defect.resolution, `defect ${defect.id} acceptance`);
			assertString(defect.resolutionCandidateId, `defect ${defect.id} acceptance candidate`);
			if (!campaignIds.has(defect.resolutionCandidateId))
				throw new Error(`P7.7 accepted defect ${defect.id} must name a frozen candidate`);
		} else if (defect.closedAt !== null || defect.resolution !== null || defect.resolutionCandidateId !== null) {
			throw new Error(`P7.7 open defect ${defect.id} cannot claim a resolution`);
		}
	}
}

function validateCampaign(campaign, { candidate, catalog, defects }) {
	assertObject(campaign, "campaign");
	if (campaign.candidateId !== candidate.candidateId)
		throw new Error("P7.7 current campaign must match the frozen candidate");
	assertIsoDate(campaign.createdAt, `campaign ${campaign.candidateId} creation`);
	assertExactIds(campaign.platforms, P77_PLATFORM_IDS, `campaign ${campaign.candidateId} platforms`);
	const runIds = new Set();
	for (const platform of campaign.platforms) {
		assertExactIds(platform.scenarios, P77_SCENARIO_RULES.map(rule => rule.id), `platform ${platform.id} scenarios`);
		if (!Array.isArray(platform.runs))
			throw new TypeError(`P7.7 platform ${platform.id} runs must be an array`);
		const latest = new Map();
		for (const run of platform.runs) {
			if (runIds.has(run.runId))
				throw new Error(`P7.7 run ID ${run.runId} is duplicated`);
			runIds.add(run.runId);
			validateRun(run, { candidate, catalog, platformId: platform.id });
			latest.set(run.scenarioId, run);
		}
		for (const scenario of platform.scenarios) {
			const catalogScenario = catalog.scenarios.find(entry => entry.id === scenario.id);
			const requirement = catalogScenario.applicability[platform.id];
			if (scenario.requirement !== requirement || !RESULT_STATES.has(scenario.state))
				throw new Error(`P7.7 platform ${platform.id} scenario ${scenario.id} has an invalid requirement or state`);
			const run = latest.get(scenario.id);
			const expectedState = requirement === "not_applicable" ? "not_applicable" : run?.state ?? "pending";
			const expectedLatest = run?.runId ?? null;
			if (scenario.state !== expectedState || scenario.latestRunId !== expectedLatest)
				throw new Error(`P7.7 platform ${platform.id} scenario ${scenario.id} summary is stale`);
		}
		const applicable = platform.scenarios.filter(scenario => scenario.requirement !== "not_applicable");
		const expectedPlatformState = derivedResultState(applicable);
		if (platform.state !== expectedPlatformState)
			throw new Error(`P7.7 platform ${platform.id} state must be ${expectedPlatformState}`);
	}
	const expectedCampaignState = blockingDefects(defects, campaign.candidateId).length > 0
		? "failed"
		: derivedResultState(campaign.platforms);
	if (campaign.state !== expectedCampaignState)
		throw new Error(`P7.7 campaign ${campaign.candidateId} state must be ${expectedCampaignState}`);
	return runIds.size;
}

function expectedOutcome(candidate, campaign, defects) {
	if (candidate.state === "uncreated")
		return "pending_candidate";
	if (campaign.state === "passed" && blockingDefects(defects, candidate.candidateId).length === 0)
		return "platform_verified";
	if (campaign.state === "failed")
		return "failed_platform_validation";
	return "pending_platform_validation";
}

export function validateP77AcceptanceDocument(ledger, { candidate, catalog }) {
	assertObject(ledger, "acceptance ledger");
	if (ledger.schemaVersion !== 1)
		throw new Error("P7.7 acceptance ledger must use schema version 1");
	validateP77CandidateDocument(candidate);
	const catalogCoverage = validateP77ScenarioCatalog(catalog);
	if (!Array.isArray(ledger.campaigns))
		throw new TypeError("P7.7 campaigns must be an array");
	const campaignIds = new Set(ledger.campaigns.map(campaign => campaign?.candidateId));
	if (campaignIds.size !== ledger.campaigns.length)
		throw new Error("P7.7 candidate campaigns must be unique");
	validateDefects(ledger.defects, campaignIds);

	if (candidate.state === "uncreated") {
		if (ledger.currentCandidateId !== null || ledger.campaigns.length !== 0 || ledger.defects.length !== 0)
			throw new Error("P7.7 uncreated candidate must not claim campaigns or defects");
		if (ledger.outcome !== "pending_candidate")
			throw new Error("P7.7 uncreated candidate outcome must be pending_candidate");
		return { ...catalogCoverage, candidateState: candidate.state, campaigns: 0, runs: 0, outcome: ledger.outcome };
	}
	if (ledger.currentCandidateId !== candidate.candidateId || ledger.campaigns.at(-1)?.candidateId !== candidate.candidateId)
		throw new Error("P7.7 current candidate must be the newest campaign");
	let runs = 0;
	for (const campaign of ledger.campaigns) {
		if (campaign.candidateId === candidate.candidateId)
			runs += validateCampaign(campaign, { candidate, catalog, defects: ledger.defects });
		else {
			assertObject(campaign, `historical campaign ${campaign.candidateId}`);
			assertString(campaign.candidateId, "historical candidate ID");
			assertIsoDate(campaign.createdAt, `historical campaign ${campaign.candidateId} creation`);
			if (campaign.supersededByCandidateId !== candidate.candidateId)
				throw new Error(`P7.7 historical campaign ${campaign.candidateId} must be invalidated by the current candidate`);
		}
	}
	const current = ledger.campaigns.at(-1);
	const outcome = expectedOutcome(candidate, current, ledger.defects);
	if (ledger.outcome !== outcome)
		throw new Error(`P7.7 acceptance outcome must be ${outcome}`);
	return {
		...catalogCoverage,
		candidateState: candidate.state,
		campaigns: ledger.campaigns.length,
		runs,
		outcome
	};
}

function updateDerivedStates(ledger, campaign) {
	for (const platform of campaign.platforms) {
		for (const scenario of platform.scenarios) {
			if (scenario.requirement === "not_applicable")
				continue;
			const latest = platform.runs.filter(run => run.scenarioId === scenario.id).at(-1);
			scenario.state = latest?.state ?? "pending";
			scenario.latestRunId = latest?.runId ?? null;
		}
		platform.state = derivedResultState(platform.scenarios.filter(scenario => scenario.requirement !== "not_applicable"));
	}
	campaign.state = blockingDefects(ledger.defects, campaign.candidateId).length > 0
		? "failed"
		: derivedResultState(campaign.platforms);
	ledger.outcome = campaign.state === "passed"
		? "platform_verified"
		: campaign.state === "failed" ? "failed_platform_validation" : "pending_platform_validation";
}

export function appendP77Campaign(ledger, candidate, catalog, { previousCandidate = null } = {}) {
	validateP77CandidateDocument(candidate);
	const baselineCandidate = previousCandidate ?? {
			schemaVersion: 1,
			state: "uncreated",
			target: candidate.target,
			candidateId: null,
			createdAt: null,
			source: null,
			packs: null,
			artifact: null
		};
	validateP77AcceptanceDocument(ledger, { candidate: baselineCandidate, catalog });
	if (ledger.campaigns.some(campaign => campaign.candidateId === candidate.candidateId))
		throw new Error(`P7.7 candidate ${candidate.candidateId} already has a campaign`);
	const next = structuredClone(ledger);
	for (const historical of next.campaigns)
		historical.supersededByCandidateId = candidate.candidateId;
	next.currentCandidateId = candidate.candidateId;
	next.campaigns.push(createP77Campaign(candidate, catalog));
	next.outcome = "pending_platform_validation";
	validateP77AcceptanceDocument(next, { candidate, catalog });
	return next;
}

export function recordP77AcceptanceRun(ledger, run, { candidate, catalog }) {
	validateP77AcceptanceDocument(ledger, { candidate, catalog });
	const next = structuredClone(ledger);
	const campaign = next.campaigns.at(-1);
	const platform = campaign.platforms.find(entry => entry.id === run.platformId);
	if (!platform)
		throw new Error(`P7.7 run ${run.runId} references an unknown platform`);
	if (campaign.platforms.some(entry => entry.runs.some(existing => existing.runId === run.runId)))
		throw new Error(`P7.7 run ID ${run.runId} already exists and cannot be overwritten`);
	validateRun(run, { candidate, catalog, platformId: platform.id });
	platform.runs.push(structuredClone(run));
	if (run.state === "failed") {
		if (next.defects.some(defect => defect.id === run.issue.id))
			throw new Error(`P7.7 defect ${run.issue.id} already exists`);
		next.defects.push({
			id: run.issue.id,
			candidateId: candidate.candidateId,
			severity: run.issue.severity,
			state: "open",
			summary: run.issue.summary,
			openedAt: run.endedAt,
			closedAt: null,
			resolution: null,
			resolutionCandidateId: null
		});
	}
	updateDerivedStates(next, campaign);
	validateP77AcceptanceDocument(next, { candidate, catalog });
	return next;
}

/** Resolve an immutable platform defect only against a frozen campaign in this ledger. */
export function resolveP77Defect(ledger, {
	defectId,
	state,
	resolution,
	resolutionCandidateId,
	closedAt
}, { candidate, catalog }) {
	validateP77AcceptanceDocument(ledger, { candidate, catalog });
	if (!DEFECT_STATES.has(state) || state === "open")
		throw new Error("P7.7 defect resolution state must be closed or accepted");
	assertString(defectId, "defect ID");
	assertString(resolution, `defect ${defectId} resolution`);
	assertString(resolutionCandidateId, `defect ${defectId} resolution candidate`);
	assertIsoDate(closedAt, `defect ${defectId} resolution time`);
	const next = structuredClone(ledger);
	const defect = next.defects.find(entry => entry.id === defectId);
	if (!defect)
		throw new Error(`P7.7 defect ${defectId} does not exist`);
	if (defect.state !== "open")
		throw new Error(`P7.7 defect ${defectId} is already ${defect.state}`);
	if (!next.campaigns.some(campaign => campaign.candidateId === resolutionCandidateId))
		throw new Error(`P7.7 resolution candidate ${resolutionCandidateId} has no frozen campaign`);
	if (state === "accepted" && defect.severity !== "P3")
		throw new Error(`P7.7 only P3 defects may be accepted; ${defectId} is ${defect.severity}`);
	if (state === "closed" && resolutionCandidateId === defect.candidateId)
		throw new Error(`P7.7 closed defect ${defectId} requires a newer frozen candidate`);
	defect.state = state;
	defect.resolution = resolution;
	defect.resolutionCandidateId = resolutionCandidateId;
	defect.closedAt = closedAt;
	updateDerivedStates(next, next.campaigns.at(-1));
	validateP77AcceptanceDocument(next, { candidate, catalog });
	return next;
}

function legacyResult(summaries) {
	const applicable = summaries.filter(summary => summary && summary.requirement !== "not_applicable");
	return derivedResultState(applicable);
}

export function deriveS315CompatibilityLedger({ candidate, catalog, ledger }) {
	validateP77AcceptanceDocument(ledger, { candidate, catalog });
	const campaign = candidate.state === "frozen" ? ledger.campaigns.at(-1) : null;
	const platforms = P77_PLATFORM_IDS.map(platformId => {
		const platform = campaign?.platforms.find(entry => entry.id === platformId);
		const scenarios = LEGACY_SCENARIO_RULES.map(rule => {
			const state = platform
				? legacyResult(rule.sources.map(id => platform.scenarios.find(entry => entry.id === id)))
				: "pending";
			const entry = {
				id: rule.id,
				state,
				evidence: state === "pending"
					? null
					: `bedrock/data/p7-7-acceptance.json#${candidate.candidateId}/${platformId}/${rule.id}`
			};
			if (rule.minimumPlayers)
				entry.minimumPlayers = rule.minimumPlayers;
			if (rule.minimumDurationMinutes)
				entry.minimumDurationMinutes = rule.minimumDurationMinutes;
			return entry;
		});
		return {
			id: platformId,
			state: derivedResultState(scenarios),
			scenarios
		};
	});
	return {
		schemaVersion: 1,
		outcome: platforms.every(platform => platform.state === "passed")
			? "realm_console_accepted"
			: "pending_platform_validation",
		target: {
			id: REDSTONE_COMPATIBILITY_TARGET.id,
			minimumEngineVersion: [...REDSTONE_COMPATIBILITY_TARGET.minimumEngineVersion]
		},
		platforms
	};
}

export function summarizeP77Acceptance({ candidate, catalog, ledger }) {
	const coverage = validateP77AcceptanceDocument(ledger, { candidate, catalog });
	const campaign = candidate.state === "frozen" ? ledger.campaigns.at(-1) : null;
	return {
		...coverage,
		candidateId: candidate.candidateId,
		platforms: P77_PLATFORM_IDS.map(id => {
			const platform = campaign?.platforms.find(entry => entry.id === id);
			const applicable = platform?.scenarios.filter(scenario => scenario.requirement !== "not_applicable")
				?? catalog.scenarios
					.filter(scenario => scenario.applicability[id] !== "not_applicable")
					.map(scenario => ({ id: scenario.id, state: "pending" }));
			return {
				id,
				state: platform?.state ?? "pending",
				applicable: applicable.length,
				passed: applicable.filter(scenario => scenario.state === "passed").length,
				failed: applicable.filter(scenario => scenario.state === "failed").length,
				pending: applicable.filter(scenario => scenario.state === "pending").length
			};
		})
	};
}
