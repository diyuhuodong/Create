import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { COMPATIBILITY_REDSTONE_CONTROLS, hasCompatibilityEngineVersion, NATIVE_REDSTONE_COMPONENTS, NATIVE_REDSTONE_INPUT_COMPONENT, NATIVE_REDSTONE_SCRIPT_API_VERSION, REDSTONE_COMPATIBILITY_TARGET } from "../behavior_pack/scripts/redstone/redstone-target.js";
import { hasRegisteredBlockComponent } from "./block-custom-component-compatibility.mjs";
import { validateMigrationMatrix } from "./migration-matrix-schema.mjs";
import { validateStage3RedstoneDeviceSourceContract } from "./s3-14-redstone-device-contract.mjs";
import { validateStage3RedstoneSemanticContract } from "./s3-14-redstone-semantic-contract.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");
const EXPECTED_BLOCK_FORMAT = "1.26.0";
const EXPECTED_CONSUMER_MINIMUM = "1.21.130";
const EXPECTED_CONSUMER_STABLE = "1.26.0";
const EXPECTED_PRODUCER_MINIMUM = "1.21.120";
const S3_14_VALIDATION_REQUIREMENTS = [
	"run static semantic, restart, failure, and concurrency validation for each redstone acceptance ID",
	"do not enable experimental creator features in the production pack",
	"record Windows, Realm, and PS acceptance before platform acceptance"
];
const CODE_COMPLETE_PENDING_STATIC_VALIDATION = "implementation_complete_pending_static_validation";

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

export function validateStage3RedstoneDecisionDocument(decision) {
	if (!decision || typeof decision !== "object" || Array.isArray(decision))
		throw new TypeError("S3-14 redstone decision must be an object");
	if (decision.schemaVersion !== 1)
		throw new Error("S3-14 redstone decision must use schema version 1");
	if (decision.decisionId !== "s3-14-realm-console-native-redstone-baseline")
		throw new Error("S3-14 decision must identify the native Realm/console redstone baseline");
	if (!hasCompatibilityEngineVersion(decision.target?.minimumEngineVersion)
		|| decision.target.blockFormatVersion !== EXPECTED_BLOCK_FORMAT
		|| decision.target.scriptApiVersion !== NATIVE_REDSTONE_SCRIPT_API_VERSION
		|| decision.target.platformAcceptance !== "pending_s3_15"
		|| !sameJson(decision.target.experimentalFeatures, []))
		throw new Error("S3-14 decision must retain the 1.26.0 native-redstone non-experimental target");
	if (decision.input?.mode !== REDSTONE_COMPATIBILITY_TARGET.inputMode
		|| decision.input.api !== "Block.getRedstonePower"
		|| decision.input.conductivityComponent !== "minecraft:redstone_conductivity"
		|| decision.input.failureMode !== "fail_closed"
		|| decision.input.nativeConsumer?.component !== "minecraft:redstone_consumer"
		|| decision.input.nativeConsumer.event !== "BlockComponentRedstoneUpdateEvent"
		|| decision.input.nativeConsumer.status !== "implemented_for_compatibility_controls")
		throw new Error("S3-14 decision must route compatibility controls through native consumer events");
	const expectedControls = COMPATIBILITY_REDSTONE_CONTROLS.map(([block, type]) => ({ block, type }));
	if (!sameJson(decision.input.controls, expectedControls))
		throw new Error("S3-14 decision controls do not match the compatibility runtime");
	if (decision.output?.mode !== "native_components_static_verified_pending_platform_acceptance"
		|| decision.output.producerMinimumFormatVersion !== EXPECTED_PRODUCER_MINIMUM
		|| decision.output.consumerMinimumFormatVersion !== EXPECTED_CONSUMER_MINIMUM
		|| decision.output.consumerStableFormatVersion !== EXPECTED_CONSUMER_STABLE
		|| !sameJson(decision.output.nativeComponents, NATIVE_REDSTONE_COMPONENTS)
		|| !sameJson(decision.output.reconsiderWhen, S3_14_VALIDATION_REQUIREMENTS))
		throw new Error("S3-14 output policy does not preserve the static-verification and platform-acceptance gates");
	if (!Array.isArray(decision.entries) || decision.entries.length === 0)
		throw new Error("S3-14 decision must name every native-redstone implementation entry");
	const entryIds = new Set();
	for (const entry of decision.entries) {
		assertString(entry?.acceptanceId, "entry acceptanceId");
		if (entry.resolution !== CODE_COMPLETE_PENDING_STATIC_VALIDATION)
			throw new Error(`S3-14 entry ${entry.acceptanceId} must retain its code-complete semantic evidence`);
		if (entryIds.has(entry.acceptanceId))
			throw new Error(`S3-14 decision contains duplicate entry ${entry.acceptanceId}`);
		entryIds.add(entry.acceptanceId);
	}
	return { entryIds, controls: expectedControls.length };
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
	const [decisionCoverage, deviceContract, semanticContract] = await Promise.all([
		Promise.resolve(validateStage3RedstoneDecisionDocument(decision)),
		validateStage3RedstoneDeviceSourceContract({ bedrockRoot }),
		validateStage3RedstoneSemanticContract({ bedrockRoot, dataRoot })
	]);
	validateMigrationMatrix(matrix);
	if (!hasCompatibilityEngineVersion(behaviorManifest.header?.min_engine_version)
		|| !hasCompatibilityEngineVersion(resourceManifest.header?.min_engine_version))
		throw new Error("S3-14 manifests must retain the shared 1.26.0 native-redstone target");
	const scriptDependency = behaviorManifest.dependencies?.find(dependency => dependency.module_name === "@minecraft/server");
	if (scriptDependency?.version !== NATIVE_REDSTONE_SCRIPT_API_VERSION)
		throw new Error("S3-14 behavior manifest must use the stable native-redstone Script API version");

	const matrixEntries = matrix.entries.filter(entry => entry.phase === 3 && entry.domain === "redstone");
	if (matrixEntries.length !== decisionCoverage.entryIds.size || matrixEntries.length !== deviceContract.acceptanceIds)
		throw new Error("S3-14 decision does not name every phase-3 redstone matrix entry");
	for (const entry of matrixEntries) {
		if (entry.status !== "static_verified" || entry.resourceStatus !== "partial" || entry.blockingReason !== null
			|| entry.behaviorPath !== "behavior_pack/scripts/redstone/redstone-device-runtime.js" || entry.persistenceSchema !== 1)
			throw new Error(`S3-14 matrix entry ${entry.acceptanceId} must retain its static-verified state`);
		if (!decisionCoverage.entryIds.has(entry.acceptanceId))
			throw new Error(`S3-14 decision is missing matrix entry ${entry.acceptanceId}`);
	}
	const queuedEntries = queue.entries.filter(entry => entry.deliveryPackage === "completed:S3-14");
	if (queuedEntries.length !== matrixEntries.length)
		throw new Error("S3-14 work queue count does not match the native-redstone entries");
	for (const entry of queuedEntries) {
		if (!decisionCoverage.entryIds.has(entry.acceptanceId) || entry.blocker !== null)
			throw new Error(`S3-14 work queue entry ${entry.acceptanceId} must remain an unblocked implementation task`);
	}

	for (const [blockType] of COMPATIBILITY_REDSTONE_CONTROLS) {
		const filename = blockType.slice("createbedrock:".length);
		const definition = await readJson(resolve(behaviorRoot, "blocks", `${filename}.json`));
		if (definition.format_version !== EXPECTED_BLOCK_FORMAT)
			throw new Error(`S3-14 input control ${blockType} must use block format ${EXPECTED_BLOCK_FORMAT}`);
		const components = definition["minecraft:block"]?.components ?? {};
		if (components["minecraft:redstone_conductivity"]?.redstone_conductor !== true)
			throw new Error(`S3-14 input control ${blockType} must remain redstone-conductive`);
		if (components["minecraft:redstone_consumer"]?.min_power !== 0
			|| components["minecraft:redstone_consumer"]?.propagates_power !== false
			|| !hasRegisteredBlockComponent(components, NATIVE_REDSTONE_INPUT_COMPONENT))
			throw new Error(`S3-14 input control ${blockType} must bind the stable native consumer component`);
	}
	if (!runtime.includes("Block.getRedstonePower") || !runtime.includes("registerNativeRedstoneEventHandler") || !runtime.includes("REDSTONE_COMPATIBILITY_TARGET"))
		throw new Error("S3-14 runtime must combine native consumer events with fail-closed polling fallback");
	for (const file of await jsonFiles(behaviorRoot)) {
		const definition = await readJson(file);
		const components = definition["minecraft:block"]?.components ?? {};
		if (NATIVE_REDSTONE_COMPONENTS.some(component => hasRegisteredBlockComponent(components, component))
			&& definition.format_version !== EXPECTED_BLOCK_FORMAT)
			throw new Error(`S3-14 native redstone component in ${file} requires format ${EXPECTED_BLOCK_FORMAT}`);
	}
	return {
		controls: decisionCoverage.controls,
		staticVerifiedPendingPlatformAcceptance: semanticContract.devices,
		matrixStaticVerified: matrixEntries.length,
		target: REDSTONE_COMPATIBILITY_TARGET.id
	};
}
