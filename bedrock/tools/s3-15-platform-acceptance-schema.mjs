import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { KERNEL_DEFAULT_TASK_BUDGET, KERNEL_MAX_TASKS_PER_TICK } from "../behavior_pack/scripts/kernel/kernel-target.js";
import { hasCompatibilityEngineVersion, REDSTONE_COMPATIBILITY_TARGET } from "../behavior_pack/scripts/redstone/redstone-target.js";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");
const PLATFORM_IDS = Object.freeze(["windows_bedrock", "test_realm", "playstation"]);
const SCENARIO_RULES = Object.freeze([
	Object.freeze({ id: "pack_load_content_log" }),
	Object.freeze({ id: "diagnostics_summary" }),
	Object.freeze({ id: "visual_resources" }),
	Object.freeze({ id: "kinetics_processing_restart" }),
	Object.freeze({ id: "redstone_controls" }),
	Object.freeze({ id: "logistics_fluid_transactions" }),
	Object.freeze({ id: "contraption_train_recovery" }),
	Object.freeze({ id: "two_player_concurrency", minimumPlayers: 2 }),
	Object.freeze({ id: "stress_30_minutes", minimumPlayers: 2, minimumDurationMinutes: 30 })
]);
const REQUIRED_METRICS = Object.freeze([
	"content_log_error_count",
	"content_log_warning_count",
	"kernel_pending",
	"kernel_failed",
	"scheduler_executed",
	"scheduler_deferred",
	"dynamic_property_bytes"
]);
const EXECUTION_STATES = new Set(["pending", "passed", "failed"]);

async function readJson(file) {
	try {
		return JSON.parse(await readFile(file, "utf8"));
	} catch (error) {
		throw new Error(`Invalid JSON in ${file}: ${error.message}`);
	}
}

function sameJson(left, right) {
	return JSON.stringify(left) === JSON.stringify(right);
}

function assertObject(value, label) {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new TypeError(`S3-15 ${label} must be an object`);
}

function assertExactIds(entries, expected, label) {
	if (!Array.isArray(entries) || entries.length !== expected.length)
		throw new Error(`S3-15 ${label} must contain exactly ${expected.length} entries`);
	const ids = entries.map(entry => entry?.id);
	if (new Set(ids).size !== ids.length || !expected.every(id => ids.includes(id)))
		throw new Error(`S3-15 ${label} must contain each required identifier exactly once`);
}

function scenarioState(scenarios) {
	if (scenarios.every(scenario => scenario.state === "passed"))
		return "passed";
	if (scenarios.some(scenario => scenario.state === "failed"))
		return "failed";
	return "pending";
}

function validateScenario(scenario, rule, platformId) {
	assertObject(scenario, `scenario ${rule.id}`);
	if (scenario.id !== rule.id)
		throw new Error(`S3-15 platform ${platformId} has a malformed scenario ${rule.id}`);
	if (!EXECUTION_STATES.has(scenario.state))
		throw new Error(`S3-15 scenario ${rule.id} on ${platformId} has an invalid state`);
	if (scenario.state === "pending" && scenario.evidence !== null)
		throw new Error(`S3-15 pending scenario ${rule.id} on ${platformId} must not claim evidence`);
	if (scenario.state !== "pending" && (typeof scenario.evidence !== "string" || scenario.evidence.length === 0))
		throw new Error(`S3-15 completed scenario ${rule.id} on ${platformId} requires evidence`);
	if ((rule.minimumPlayers ?? null) !== (scenario.minimumPlayers ?? null))
		throw new Error(`S3-15 scenario ${rule.id} on ${platformId} has the wrong player gate`);
	if ((rule.minimumDurationMinutes ?? null) !== (scenario.minimumDurationMinutes ?? null))
		throw new Error(`S3-15 scenario ${rule.id} on ${platformId} has the wrong duration gate`);
}

function validatePerformanceBaseline(baseline) {
	assertObject(baseline, "performance baseline");
	if (baseline.schemaVersion !== 1)
		throw new Error("S3-15 performance baseline must use schema version 1");
	if (baseline.kernel?.defaultTaskBudget !== KERNEL_DEFAULT_TASK_BUDGET
		|| baseline.kernel?.maxTasksPerTick !== KERNEL_MAX_TASKS_PER_TICK)
		throw new Error("S3-15 performance baseline must match the production kernel budgets");
	if (baseline.observation?.minimumPlayers !== 2 || baseline.observation?.minimumDurationMinutes !== 30)
		throw new Error("S3-15 performance baseline requires a two-player 30-minute observation");
	if (!sameJson(baseline.observation?.requiredMetrics, REQUIRED_METRICS))
		throw new Error("S3-15 performance baseline must preserve all required diagnostics metrics");
}

export function validateStage3PlatformAcceptanceDocument(ledger) {
	assertObject(ledger, "platform acceptance ledger");
	if (ledger.schemaVersion !== 1)
		throw new Error("S3-15 platform acceptance ledger must use schema version 1");
	if (ledger.target?.id !== REDSTONE_COMPATIBILITY_TARGET.id
		|| !hasCompatibilityEngineVersion(ledger.target.minimumEngineVersion))
		throw new Error("S3-15 platform acceptance ledger must retain the 1.21.80 compatibility target");
	assertExactIds(ledger.platforms, PLATFORM_IDS, "platforms");

	let acceptedPlatforms = 0;
	let pendingPlatforms = 0;
	let failedPlatforms = 0;
	for (const platform of ledger.platforms) {
		assertObject(platform, "platform");
		assertExactIds(platform.scenarios, SCENARIO_RULES.map(rule => rule.id), `scenarios on ${platform.id}`);
		for (const rule of SCENARIO_RULES)
			validateScenario(platform.scenarios.find(scenario => scenario.id === rule.id), rule, platform.id);
		const expectedState = scenarioState(platform.scenarios);
		if (platform.state !== expectedState)
			throw new Error(`S3-15 platform ${platform.id} must be ${expectedState} for its scenario evidence`);
		if (expectedState === "passed")
			acceptedPlatforms++;
		else if (expectedState === "failed")
			failedPlatforms++;
		else
			pendingPlatforms++;
	}
	const fullyAccepted = acceptedPlatforms === PLATFORM_IDS.length;
	if (fullyAccepted && ledger.outcome !== "realm_console_accepted")
		throw new Error("S3-15 fully evidenced platform results must declare realm_console_accepted");
	if (!fullyAccepted && ledger.outcome !== "pending_platform_validation")
		throw new Error("S3-15 incomplete platform results must remain pending_platform_validation");
	return { acceptedPlatforms, failedPlatforms, pendingPlatforms, platforms: PLATFORM_IDS.length, stressMinutes: 30 };
}

export async function validateStage3PlatformAcceptance({ bedrockRoot = defaultBedrockRoot, dataRoot = defaultBedrockRoot } = {}) {
	const [behaviorManifest, resourceManifest, ledger, baseline, smokeTest] = await Promise.all([
		readJson(resolve(bedrockRoot, "behavior_pack", "manifest.json")),
		readJson(resolve(bedrockRoot, "resource_pack", "manifest.json")),
		readJson(resolve(dataRoot, "data", "s3-15-platform-acceptance.json")),
		readJson(resolve(dataRoot, "data", "s3-15-performance-baseline.json")),
		readFile(resolve(dataRoot, "tests", "world", "smoke-test.md"), "utf8")
	]);
	if (!hasCompatibilityEngineVersion(behaviorManifest.header?.min_engine_version)
		|| !hasCompatibilityEngineVersion(resourceManifest.header?.min_engine_version))
		throw new Error("S3-15 manifests must retain the shared 1.21.80 compatibility target");
	if (!/two[- ]players?/.test(smokeTest) || !smokeTest.includes("30-minute"))
		throw new Error("S3-15 smoke test must require two players and a 30-minute pressure run");
	validatePerformanceBaseline(baseline);
	return validateStage3PlatformAcceptanceDocument(ledger);
}
