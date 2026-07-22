import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assertReleaseProjectionCoverage } from "../behavior_pack/scripts/contraptions/projection-registry.js";
import { SCHEDULE_CONDITION_TYPES, SCHEDULE_INSTRUCTION_TYPES } from "../behavior_pack/scripts/trains/schedule-ast.js";

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageIds = ["P7.5.0", "P7.5A", "P7.5B", "P7.5C", "P7.5D", "P7.5E", "P7.5F", "P7.5G"];

async function text(root, relative) {
	const path = resolve(root, relative);
	if (!(await stat(path)).isFile())
		throw new Error(`P7.5 is missing ${relative}`);
	return readFile(path, "utf8");
}

function requireTokens(source, tokens, label) {
	for (const token of tokens)
		if (!source.includes(token))
			throw new Error(`P7.5 ${label} is missing ${token}`);
}

export async function validateP75StaticContract({ root = defaultRoot, trackingRoot = defaultRoot } = {}) {
	const repositoryRoot = resolve(trackingRoot, "..");
	const ledger = JSON.parse(await text(trackingRoot, "data/p7-5-java-parity-ledger.json"));
	if (ledger.schemaVersion !== 1 || ledger.packages?.length !== packageIds.length || ledger.packages.some((entry, index) => entry.id !== packageIds[index] || entry.status !== "static_verified"))
		throw new Error("P7.5 parity ledger must contain eight ordered static-verified packages");
	if (Object.values(ledger.platform ?? {}).some(status => status !== "pending"))
		throw new Error("P7.5 cannot infer platform acceptance from static checks");
	for (const entry of ledger.packages)
		for (const path of [...entry.javaEvidence, ...entry.implementation])
			await stat(resolve(repositoryRoot, path));

	const catalog = JSON.parse(await text(trackingRoot, "p7-5-projection-catalog.json"));
	const audit = assertReleaseProjectionCoverage();
	if (catalog.schemaVersion !== 1 || catalog.entries.length !== 84 || audit.missing.length || audit.authorityOnly.length)
		throw new Error("P7.5 release requires all 84 dedicated movable-block projections");
	if (new Set(catalog.entries.map(entry => entry.blockTypeId)).size !== 84 || new Set(catalog.entries.map(entry => entry.entityTypeId)).size !== 84)
		throw new Error("P7.5 projection catalog contains duplicate block or entity mappings");
	for (const entry of catalog.entries) {
		if (entry.entityTypeId === "createbedrock:contraption_part")
			throw new Error(`P7.5 ${entry.blockTypeId} still uses the legacy generic projection`);
		const path = entry.entityTypeId.split(":")[1];
		const behavior = JSON.parse(await text(root, `behavior_pack/entities/${path}.json`));
		const resource = JSON.parse(await text(root, `resource_pack/entity/${path}.entity.json`));
		if (behavior["minecraft:entity"]?.description?.identifier !== entry.entityTypeId || resource["minecraft:client_entity"]?.description?.identifier !== entry.entityTypeId)
			throw new Error(`P7.5 projection resources disagree for ${entry.entityTypeId}`);
	}

	const [pose, assembly, payload, geometry, controller, portal, scheduleRuntime, scheduleForm, trainRuntime, packageRuntime, recovery, trainEntity, packageJson] = await Promise.all([
		text(root, "behavior_pack/scripts/contraptions/pose-transform.js"),
		text(root, "behavior_pack/scripts/contraptions/dynamic-assembly-controller.js"),
		text(root, "behavior_pack/scripts/contraptions/moving-block-data.js"),
		text(root, "behavior_pack/scripts/trains/track-geometry.js"),
		text(root, "behavior_pack/scripts/trains/train-controller.js"),
		text(root, "behavior_pack/scripts/trains/portal-track-transfer.js"),
		text(root, "behavior_pack/scripts/trains/schedule-runtime.js"),
		text(root, "behavior_pack/scripts/trains/schedule-form-runtime.js"),
		text(root, "behavior_pack/scripts/trains/train-runtime.js"),
		text(root, "behavior_pack/scripts/logistics/package-runtime.js"),
		text(root, "behavior_pack/scripts/trains/train-recovery.js"),
		text(root, "behavior_pack/entities/train.json"),
		text(trackingRoot, "package.json")
	]);
	requireTokens(pose, ["quaternion", "transformBlockAlignedVector", "interpolateAssemblyPose"], "three-axis pose");
	requireTokens(assembly, ["sourceClaims", "destinationClaims", "checkpointAssemblyAuthority", "verifyBlockRestore"], "assembly authority journal");
	requireTokens(payload, ["captureMovingBlockPayload", "quiesceMovingBlockData", "verifyMovingBlockData"], "moving payload lifecycle");
	requireTokens(geometry, ["cubic_bezier", "createLut", "sampleTrackGeometry"], "track geometry");
	requireTokens(controller, ["TrainOccupancyAuthority", "reservedEdgeIds: new Set([route.edgeIds[0]])", "ScheduleRuntime", "bindPassenger", "setPlatformDoors"], "train authority");
	requireTokens(portal, ["reserveDestination", "switchAuthority", "rebuildProjection", "releaseEntrance", "retry(id)"], "Portal transaction");
	requireTokens(scheduleRuntime, ["PRE_TRANSIT", "IN_TRANSIT", "POST_TRANSIT", "conditionBranches"], "Schedule runtime");
	requireTokens(scheduleForm, ["openConfigurationFormSession", "submitVersionedConfigurationForm", "revision_conflict"], "Schedule form CAS");
	requireTokens(trainRuntime, ["deliverTrainPackages", "transferTrainThroughPortal", "recoverTrainRuntime", "setTrainRedstoneLinkResolver"], "runtime integration");
	requireTokens(packageRuntime, ["settleTrainPackageTransfer", "retrieveTrainPackages", "getTrainPackageCargoState"], "package integration");
	requireTokens(recovery, ["occupancy_missing", "rebuild_projection", "remove_orphan_projection", "retry_portal"], "fault recovery");
	requireTokens(trainEntity, ["minecraft:rideable", "seat_count"], "train passenger projection");
	requireTokens(packageJson, ["generate-p7-5-projections.mjs"], "release generation");
	if (SCHEDULE_INSTRUCTION_TYPES.length !== 5 || SCHEDULE_CONDITION_TYPES.length !== 9)
		throw new Error("P7.5 Schedule registry must expose exactly five instructions and nine conditions");
	return { packages: 8, projections: catalog.entries.length, scheduleConditions: 9, scheduleInstructions: 5 };
}
