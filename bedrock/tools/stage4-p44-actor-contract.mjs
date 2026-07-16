import { constants } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateMigrationMatrix } from "./migration-matrix-schema.mjs";
import { stage4PackageFor, validateStage4WorkQueue } from "./stage4-work-queue-schema.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");
const defaultRepositoryRoot = resolve(defaultBedrockRoot, "..");
const P44_ACCEPTANCE_IDS = new Set([
	"CONTRAPTIONS-DEPLOYER-BLOCK",
	"CONTRAPTIONS-DEPLOYER-BLOCK_ENTITY",
	"CONTRAPTIONS-DRILL-BLOCK_ENTITY",
	"CONTRAPTIONS-HARVESTER-BLOCK_ENTITY",
	"CONTRAPTIONS-MECHANICAL-ARM-BLOCK",
	"CONTRAPTIONS-MECHANICAL-ARM-BLOCK_ENTITY",
	"CONTRAPTIONS-MECHANICAL-DRILL-BLOCK",
	"CONTRAPTIONS-MECHANICAL-HARVESTER-BLOCK"
]);

async function readJson(file) {
	try {
		return JSON.parse(await readFile(file, "utf8"));
	} catch (error) {
		throw new Error(`Invalid JSON in ${file}: ${error.message}`);
	}
}

async function requireFile(file, label) {
	try {
		if (!(await stat(file)).isFile())
			throw new Error("not a file");
	} catch (error) {
		throw new Error(`${label} is missing: ${file} (${error.message})`);
	}
}

async function isAbsent(file) {
	try {
		await access(file, constants.F_OK);
		return false;
	} catch {
		return true;
	}
}

function requireLanguage(lines, key) {
	if (!lines.some(line => line.startsWith(`${key}=`)))
		throw new Error(`Missing language key ${key}`);
}

export async function validateStage4P44Actors({
	bedrockRoot = defaultBedrockRoot,
	built = false,
	repositoryRoot = defaultRepositoryRoot,
	trackingRoot = defaultBedrockRoot
} = {}) {
	const [matrix, queue, english, chinese, runtime, actorState, movable, kinetic] = await Promise.all([
		readJson(resolve(trackingRoot, "data", "migration-matrix.json")),
		readJson(resolve(trackingRoot, "data", "stage4-work-queue.json")),
		readFile(resolve(bedrockRoot, "resource_pack", "texts", "en_US.lang"), "utf8"),
		readFile(resolve(bedrockRoot, "resource_pack", "texts", "zh_CN.lang"), "utf8"),
		readFile(resolve(bedrockRoot, "behavior_pack", "scripts", "contraptions", "contraption-actors-runtime.js"), "utf8"),
		readFile(resolve(bedrockRoot, "behavior_pack", "scripts", "contraptions", "contraption-actors.js"), "utf8"),
		readFile(resolve(bedrockRoot, "behavior_pack", "scripts", "contraptions", "movable-blocks.js"), "utf8"),
		readFile(resolve(bedrockRoot, "behavior_pack", "scripts", "kinetics", "kinetic-world.js"), "utf8")
	]);
	validateMigrationMatrix(matrix);
	validateStage4WorkQueue(queue, matrix);
	const entries = matrix.entries.filter(entry => P44_ACCEPTANCE_IDS.has(entry.acceptanceId));
	if (entries.length !== P44_ACCEPTANCE_IDS.size
		|| entries.some(entry => entry.status !== "static_verified" || stage4PackageFor(entry) !== "P4.4" || entry.persistenceSchema !== 2))
		throw new Error("P4.4 acceptance entries must be static-verified with moving actor persistence");
	for (const entry of entries) {
		const queued = queue.entries.find(candidate => candidate.acceptanceId === entry.acceptanceId);
		if (!queued || queued.deliveryPackage !== "completed:P4.4")
			throw new Error(`P4.4 queue entry ${entry.acceptanceId} must be completed`);
	}
	for (const required of [
		"PERSISTENT_ACTOR_TYPES",
		"registerMovingBlockDataContributor(typeId, name",
		"applyHarvesterAt",
		"deployAt",
		"updateDynamicAssemblyBlockData(assembly.dimensionId, assembly.id",
		"MECHANICAL_ARM_BLOCK"
	])
		if (!runtime.includes(required))
			throw new Error(`P4.4 actor runtime is missing ${required}`);
	for (const required of ["normalizeActorItemState", "canHarvestBlock", "canDrillBlock", "transferPortableInterfaceItem"])
		if (!actorState.includes(required))
			throw new Error(`P4.4 actor state boundary is missing ${required}`);
	for (const identifier of ["deployer", "mechanical_drill", "mechanical_harvester", "mechanical_arm"]) {
		const block = await readJson(resolve(bedrockRoot, "behavior_pack", "blocks", `${identifier}.json`));
		if (block["minecraft:block"]?.description?.identifier !== `createbedrock:${identifier}`)
			throw new Error(`P4.4 block ${identifier} has an invalid identifier`);
		if (!movable.includes(`\"createbedrock:${identifier}\"`) || !kinetic.includes(`\"createbedrock:${identifier}\"`))
			throw new Error(`P4.4 actor ${identifier} must have movable and kinetic registrations`);
		requireLanguage(english.split(/\r?\n/), `tile.createbedrock:${identifier}.name`);
		requireLanguage(chinese.split(/\r?\n/), `tile.createbedrock:${identifier}.name`);
		await requireFile(resolve(bedrockRoot, "behavior_pack", "loot_tables", "blocks", `${identifier}.json`), `P4.4 ${identifier} loot`);
	}
	await requireFile(resolve(bedrockRoot, "behavior_pack", "recipes", "mechanical_drill.json"), "P4.4 Mechanical Drill recipe");
	await requireFile(resolve(bedrockRoot, "behavior_pack", "recipes", "mechanical_harvester.json"), "P4.4 Mechanical Harvester recipe");
	for (const identifier of ["deployer", "mechanical_arm"])
		if (!await isAbsent(resolve(bedrockRoot, "behavior_pack", "recipes", `${identifier}.json`)))
			throw new Error(`P4.4 ${identifier} must not invent a recipe while its Java dependencies are unported`);
	for (const source of [
		"src/generated/resources/data/create/recipe/crafting/kinetics/deployer.json",
		"src/generated/resources/data/create/recipe/crafting/kinetics/mechanical_drill.json",
		"src/generated/resources/data/create/recipe/crafting/kinetics/mechanical_harvester.json",
		"src/generated/resources/data/create/recipe/crafting/kinetics/mechanical_arm.json"
	])
		await requireFile(resolve(repositoryRoot, source), `P4.4 Java source ${source}`);
	if (built)
		for (const geometry of ["deployer", "mechanical_drill", "mechanical_harvester", "mechanical_arm"])
			await requireFile(resolve(bedrockRoot, "resource_pack", "models", "blocks", `${geometry}.geo.json`), `Built P4.4 ${geometry} geometry`);
	return { blocks: 4, deferredRecipes: 2, entries: entries.length, internalBlockEntities: 2 };
}
