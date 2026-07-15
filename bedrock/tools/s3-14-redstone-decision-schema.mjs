import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { COMPATIBILITY_REDSTONE_CONTROLS, FORBIDDEN_REDSTONE_COMPONENTS, hasCompatibilityEngineVersion, REDSTONE_COMPATIBILITY_TARGET } from "../behavior_pack/scripts/redstone/redstone-target.js";
import { REDSTONE_OUTPUT_BLOCKER } from "./migration-classification.mjs";
import { validateMigrationMatrix } from "./migration-matrix-schema.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");
const EXPECTED_CONSUMER_MINIMUM = "1.21.130";
const EXPECTED_CONSUMER_STABLE = "1.26.0";
const EXPECTED_PRODUCER_MINIMUM = "1.21.120";
const S3_14_RECONSIDERATION_REQUIREMENTS = [
	"raise the minimum Bedrock and Realm target to a stable component version",
	"do not enable experimental creator features in the production pack",
	"record Windows, Realm, and PS acceptance before changing matrix status"
];

async function readJson(file) {
	try {
		return JSON.parse(await readFile(file, "utf8"));
	} catch (error) {
		throw new Error(`Invalid JSON in ${file}: ${error.message}`);
	}
}

async function jsonFiles(directory) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const file = resolve(directory, entry.name);
		if (entry.isDirectory())
			files.push(...await jsonFiles(file));
		else if (extname(entry.name) === ".json")
			files.push(file);
	}
	return files;
}

function sameJson(left, right) {
	return JSON.stringify(left) === JSON.stringify(right);
}

function assertString(value, label) {
	if (typeof value !== "string" || value.length === 0)
		throw new TypeError(`S3-14 decision ${label} must be a non-empty string`);
}

function assertStringArray(value, label) {
	if (!Array.isArray(value) || !value.every(entry => typeof entry === "string" && entry.length > 0))
		throw new TypeError(`S3-14 decision ${label} must be a string array`);
}

export function validateStage3RedstoneDecisionDocument(decision) {
	if (!decision || typeof decision !== "object" || Array.isArray(decision))
		throw new TypeError("S3-14 redstone decision must be an object");
	if (decision.schemaVersion !== 1)
		throw new Error("S3-14 redstone decision must use schema version 1");
	if (decision.decisionId !== "s3-14-realm-console-compatibility-baseline")
		throw new Error("S3-14 decision must identify the Realm/console compatibility baseline");
	if (!hasCompatibilityEngineVersion(decision.target?.minimumEngineVersion)
		|| decision.target.blockFormatVersion !== "1.21.80"
		|| decision.target.platformAcceptance !== "pending_s3_15"
		|| !sameJson(decision.target.experimentalFeatures, []))
		throw new Error("S3-14 decision must retain the 1.21.80 non-experimental target pending S3-15");
	if (decision.input?.mode !== REDSTONE_COMPATIBILITY_TARGET.inputMode
		|| decision.input.api !== "Block.getRedstonePower"
		|| decision.input.conductivityComponent !== "minecraft:redstone_conductivity"
		|| decision.input.failureMode !== "fail_closed")
		throw new Error("S3-14 decision must use fail-closed registered Block.getRedstonePower polling");
	const expectedControls = COMPATIBILITY_REDSTONE_CONTROLS.map(([block, type]) => ({ block, type }));
	if (!sameJson(decision.input.controls, expectedControls))
		throw new Error("S3-14 decision controls do not match the compatibility runtime");
	if (decision.output?.mode !== "blocked_on_compatibility_target"
		|| decision.output.producerMinimumFormatVersion !== EXPECTED_PRODUCER_MINIMUM
		|| decision.output.consumerMinimumFormatVersion !== EXPECTED_CONSUMER_MINIMUM
		|| decision.output.consumerStableFormatVersion !== EXPECTED_CONSUMER_STABLE
		|| !sameJson(decision.output.forbiddenComponents, FORBIDDEN_REDSTONE_COMPONENTS)
		|| !sameJson(decision.output.reconsiderWhen, S3_14_RECONSIDERATION_REQUIREMENTS))
		throw new Error("S3-14 output policy does not preserve the documented version gate");
	if (!Array.isArray(decision.blockers) || decision.blockers.length === 0)
		throw new Error("S3-14 decision must name every retained redstone blocker");
	const blockerIds = new Set();
	for (const blocker of decision.blockers) {
		assertString(blocker?.acceptanceId, "blocker acceptanceId");
		if (blocker.resolution !== "blocked")
			throw new Error(`S3-14 blocker ${blocker.acceptanceId} must remain explicitly blocked`);
		if (blockerIds.has(blocker.acceptanceId))
			throw new Error(`S3-14 decision contains duplicate blocker ${blocker.acceptanceId}`);
		blockerIds.add(blocker.acceptanceId);
	}
	return { blockerIds, controls: expectedControls.length };
}

export async function validateStage3RedstoneDecision({ bedrockRoot = defaultBedrockRoot, dataRoot = defaultBedrockRoot } = {}) {
	const behaviorRoot = resolve(bedrockRoot, "behavior_pack");
	const [behaviorManifest, resourceManifest, matrix, queue, decision, runtime] = await Promise.all([
		readJson(resolve(behaviorRoot, "manifest.json")),
		readJson(resolve(bedrockRoot, "resource_pack", "manifest.json")),
		readJson(resolve(dataRoot, "data", "migration-matrix.json")),
		readJson(resolve(dataRoot, "data", "stage3-work-queue.json")),
		readJson(resolve(dataRoot, "data", "s3-14-redstone-decision.json")),
		readFile(resolve(behaviorRoot, "scripts", "redstone", "redstone-runtime.js"), "utf8")
	]);
	const decisionCoverage = validateStage3RedstoneDecisionDocument(decision);
	validateMigrationMatrix(matrix);
	if (!hasCompatibilityEngineVersion(behaviorManifest.header?.min_engine_version)
		|| !hasCompatibilityEngineVersion(resourceManifest.header?.min_engine_version))
		throw new Error("S3-14 manifests must retain the shared 1.21.80 compatibility target");

	const matrixEntries = matrix.entries.filter(entry => entry.phase === 3 && entry.domain === "redstone");
	if (matrixEntries.length !== decisionCoverage.blockerIds.size)
		throw new Error("S3-14 decision does not name every phase-3 redstone matrix entry");
	for (const entry of matrixEntries) {
		if (entry.status !== "blocked" || entry.blockingReason !== REDSTONE_OUTPUT_BLOCKER)
			throw new Error(`S3-14 matrix entry ${entry.acceptanceId} must retain the compatibility blocker`);
		if (!decisionCoverage.blockerIds.has(entry.acceptanceId))
			throw new Error(`S3-14 decision is missing matrix blocker ${entry.acceptanceId}`);
	}
	const queuedBlockers = queue.entries.filter(entry => entry.deliveryPackage === "S3-14");
	if (queuedBlockers.length !== matrixEntries.length)
		throw new Error("S3-14 work queue count does not match the matrix blockers");
	for (const entry of queuedBlockers) {
		if (!decisionCoverage.blockerIds.has(entry.acceptanceId) || entry.blocker !== REDSTONE_OUTPUT_BLOCKER)
			throw new Error(`S3-14 work queue entry ${entry.acceptanceId} lacks the approved blocker conclusion`);
	}

	for (const [blockType] of COMPATIBILITY_REDSTONE_CONTROLS) {
		const filename = blockType.slice("createbedrock:".length);
		const definition = await readJson(resolve(behaviorRoot, "blocks", `${filename}.json`));
		if (definition["minecraft:block"]?.components?.["minecraft:redstone_conductivity"]?.redstone_conductor !== true)
			throw new Error(`S3-14 input control ${blockType} must remain redstone-conductive`);
	}
	if (!runtime.includes("Block.getRedstonePower") || !runtime.includes("REDSTONE_COMPATIBILITY_TARGET"))
		throw new Error("S3-14 runtime must expose the compatibility polling implementation and target diagnostics");
	for (const file of await jsonFiles(behaviorRoot)) {
		const contents = await readFile(file, "utf8");
		for (const component of FORBIDDEN_REDSTONE_COMPONENTS) {
			if (contents.includes(`\"${component}\"`))
				throw new Error(`S3-14 compatibility pack must not declare ${component} in ${file}`);
		}
	}
	return {
		blockers: matrixEntries.length,
		controls: decisionCoverage.controls,
		target: REDSTONE_COMPATIBILITY_TARGET.id
	};
}
