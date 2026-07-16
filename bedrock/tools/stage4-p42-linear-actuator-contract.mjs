import { constants } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateMigrationMatrix } from "./migration-matrix-schema.mjs";
import { stage4PackageFor, validateStage4WorkQueue } from "./stage4-work-queue-schema.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");
const defaultRepositoryRoot = resolve(defaultBedrockRoot, "..");
const P42_ACCEPTANCE_IDS = new Set([
	"CONTRAPTIONS-MECHANICAL-PISTON-BLOCK",
	"CONTRAPTIONS-MECHANICAL-PISTON-BLOCK_ENTITY",
	"CONTRAPTIONS-STICKY-MECHANICAL-PISTON-BLOCK",
	"CONTRAPTIONS-MECHANICAL-PISTON-HEAD-BLOCK",
	"CONTRAPTIONS-ROPE-PULLEY-BLOCK",
	"CONTRAPTIONS-ROPE-PULLEY-BLOCK_ENTITY",
	"CONTRAPTIONS-ROPE-BLOCK",
	"CONTRAPTIONS-PULLEY-MAGNET-BLOCK",
	"CONTRAPTIONS-HOSE-PULLEY-BLOCK",
	"CONTRAPTIONS-HOSE-PULLEY-BLOCK_ENTITY",
	"CONTRAPTIONS-GANTRY-CARRIAGE-BLOCK",
	"CONTRAPTIONS-GANTRY-CONTRAPTION-ENTITY",
	"CONTRAPTIONS-GANTRY-PINION-BLOCK_ENTITY",
	"CONTRAPTIONS-GANTRY-SHAFT-BLOCK",
	"CONTRAPTIONS-GANTRY-SHAFT-BLOCK_ENTITY"
]);

const BLOCKS = [
	"mechanical_piston",
	"sticky_mechanical_piston",
	"mechanical_piston_head",
	"rope_pulley",
	"rope",
	"pulley_magnet",
	"hose_pulley",
	"gantry_carriage",
	"gantry_shaft"
];
const DRIVERS = ["mechanical_piston", "sticky_mechanical_piston", "rope_pulley", "hose_pulley", "gantry_carriage"];
const CRAFTABLE_BLOCKS = ["mechanical_piston", "sticky_mechanical_piston", "rope_pulley", "hose_pulley", "gantry_carriage", "gantry_shaft"];
const TRANSIENT_BLOCKS = ["mechanical_piston_head", "rope", "pulley_magnet"];

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

export async function validateStage4P42LinearActuators({
	bedrockRoot = defaultBedrockRoot,
	built = false,
	repositoryRoot = defaultRepositoryRoot,
	trackingRoot = defaultBedrockRoot
} = {}) {
	const [matrix, queue, english, chinese, runtime, state, contraptionRuntime, kineticWorld, movable] = await Promise.all([
		readJson(resolve(trackingRoot, "data", "migration-matrix.json")),
		readJson(resolve(trackingRoot, "data", "stage4-work-queue.json")),
		readFile(resolve(bedrockRoot, "resource_pack", "texts", "en_US.lang"), "utf8"),
		readFile(resolve(bedrockRoot, "resource_pack", "texts", "zh_CN.lang"), "utf8"),
		readFile(resolve(bedrockRoot, "behavior_pack", "scripts", "contraptions", "linear-actuator-runtime.js"), "utf8"),
		readFile(resolve(bedrockRoot, "behavior_pack", "scripts", "contraptions", "linear-actuator-state.js"), "utf8"),
		readFile(resolve(bedrockRoot, "behavior_pack", "scripts", "contraptions", "contraption-runtime.js"), "utf8"),
		readFile(resolve(bedrockRoot, "behavior_pack", "scripts", "kinetics", "kinetic-world.js"), "utf8"),
		readFile(resolve(bedrockRoot, "behavior_pack", "scripts", "contraptions", "movable-blocks.js"), "utf8")
	]);
	validateMigrationMatrix(matrix);
	validateStage4WorkQueue(queue, matrix);
	const entries = matrix.entries.filter(entry => P42_ACCEPTANCE_IDS.has(entry.acceptanceId));
	if (entries.length !== P42_ACCEPTANCE_IDS.size
		|| entries.some(entry => entry.status !== "static_verified" || stage4PackageFor(entry) !== "P4.2" || entry.persistenceSchema !== 2))
		throw new Error("P4.2 acceptance entries must be static-verified with the shared persistence schema");
	for (const entry of entries) {
		const queued = queue.entries.find(candidate => candidate.acceptanceId === entry.acceptanceId);
		if (!queued || queued.deliveryPackage !== "completed:P4.2")
			throw new Error(`P4.2 queue entry ${entry.acceptanceId} must be completed`);
	}
	for (const required of [
		"registerDynamicAssemblyOwnerRestorer(LINEAR_ACTUATOR_OWNER_KIND, restoreOwner)",
		"assembleExternalDynamicAssembly({",
		"ensureExternalDynamicAssemblyProjection(active.dimensionId, active.id)",
		"setExternalDynamicAssemblyTransform(active.dimensionId, active.id, movement.transform)",
		"disassembleExternalDynamicAssembly(active.dimensionId, active.id)",
		"MAX_DYNAMIC_ASSEMBLY_BLOCKS"
	])
		if (!runtime.includes(required))
			throw new Error(`P4.2 linear actuator runtime is missing ${required}`);
	for (const required of [
		"LINEAR_SPEED_TO_SUBBLOCK_UNITS = 64",
		"MAX_LINEAR_ACTUATOR_BLOCKS = 256",
		"freezeLinearActuator",
		"releaseLinearActuator",
		"ASSEMBLY_SUBBLOCK_UNITS / 4"
	])
		if (!state.includes(required))
			throw new Error(`P4.2 fixed-point state is missing ${required}`);
	for (const required of ["activeExternalAssemblies", "assemblyOwnerRestorers", "assembleExternalDynamicAssembly", "ensureExternalDynamicAssemblyProjection", "host: clone(active.host)"])
		if (!contraptionRuntime.includes(required))
			throw new Error(`P4.2 shared dynamic assembly bridge is missing ${required}`);
	for (const identifier of DRIVERS) {
		if (!runtime.includes(`\"createbedrock:${identifier}\"`))
			throw new Error(`P4.2 runtime is missing actuator driver ${identifier}`);
		if (!kineticWorld.includes(`\"createbedrock:${identifier}\"`))
			throw new Error(`P4.2 kinetic model is missing ${identifier}`);
	}
	for (const identifier of BLOCKS) {
		const block = await readJson(resolve(bedrockRoot, "behavior_pack", "blocks", `${identifier}.json`));
		if (block["minecraft:block"]?.description?.identifier !== `createbedrock:${identifier}`)
			throw new Error(`P4.2 block ${identifier} has an invalid identifier`);
		if (!movable.includes(`\"createbedrock:${identifier}\"`))
			throw new Error(`P4.2 movable-block policy is missing ${identifier}`);
		requireLanguage(english.split(/\r?\n/), `tile.createbedrock:${identifier}.name`);
		requireLanguage(chinese.split(/\r?\n/), `tile.createbedrock:${identifier}.name`);
	}
	for (const identifier of CRAFTABLE_BLOCKS) {
		await requireFile(resolve(bedrockRoot, "behavior_pack", "recipes", `${identifier}.json`), `P4.2 ${identifier} recipe`);
		await requireFile(resolve(bedrockRoot, "behavior_pack", "loot_tables", "blocks", `${identifier}.json`), `P4.2 ${identifier} loot`);
	}
	for (const identifier of TRANSIENT_BLOCKS) {
		if (!await isAbsent(resolve(bedrockRoot, "behavior_pack", "recipes", `${identifier}.json`)))
			throw new Error(`P4.2 transient ${identifier} must not gain a survival recipe`);
		await requireFile(resolve(bedrockRoot, "behavior_pack", "loot_tables", "blocks", `${identifier}.json`), `P4.2 ${identifier} loot`);
	}
	const gantry = await readJson(resolve(bedrockRoot, "behavior_pack", "entities", "gantry_contraption.json"));
	const gantryClient = await readJson(resolve(bedrockRoot, "resource_pack", "entity", "gantry_contraption.entity.json"));
	if (gantry["minecraft:entity"]?.description?.identifier !== "createbedrock:gantry_contraption"
		|| gantryClient["minecraft:client_entity"]?.description?.identifier !== "createbedrock:gantry_contraption")
		throw new Error("P4.2 Gantry Contraption must have matched BP/RP entity definitions");
	requireLanguage(english.split(/\r?\n/), "entity.createbedrock:gantry_contraption.name");
	requireLanguage(chinese.split(/\r?\n/), "entity.createbedrock:gantry_contraption.name");
	for (const source of [
		"src/generated/resources/data/create/recipe/crafting/kinetics/mechanical_piston.json",
		"src/generated/resources/data/create/recipe/crafting/kinetics/sticky_mechanical_piston.json",
		"src/generated/resources/data/create/recipe/crafting/kinetics/rope_pulley.json",
		"src/generated/resources/data/create/recipe/crafting/kinetics/hose_pulley.json",
		"src/generated/resources/data/create/recipe/crafting/kinetics/gantry_carriage.json",
		"src/generated/resources/data/create/recipe/crafting/kinetics/gantry_shaft.json"
	])
		await requireFile(resolve(repositoryRoot, source), `P4.2 Java source ${source}`);
	if (built) {
		for (const geometry of ["mechanical_piston", "mechanical_piston_head", "rope_pulley", "hose_pulley", "rope", "pulley_magnet", "gantry_carriage", "gantry_shaft"])
			await requireFile(resolve(bedrockRoot, "resource_pack", "models", "blocks", `${geometry}.geo.json`), `Built P4.2 ${geometry} geometry`);
	}
	return { blocks: BLOCKS.length, drivers: DRIVERS.length, entries: entries.length, transientBlocks: TRANSIENT_BLOCKS.length };
}
