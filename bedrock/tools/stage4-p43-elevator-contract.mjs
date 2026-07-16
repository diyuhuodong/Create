import { constants } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateMigrationMatrix } from "./migration-matrix-schema.mjs";
import { stage4PackageFor, validateStage4WorkQueue } from "./stage4-work-queue-schema.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");
const defaultRepositoryRoot = resolve(defaultBedrockRoot, "..");
const P43_ACCEPTANCE_IDS = new Set([
	"CONTRAPTIONS-ELEVATOR-CONTACT-BLOCK",
	"CONTRAPTIONS-ELEVATOR-CONTACT-BLOCK_ENTITY",
	"CONTRAPTIONS-ELEVATOR-PULLEY-BLOCK",
	"CONTRAPTIONS-ELEVATOR-PULLEY-BLOCK_ENTITY"
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

export async function validateStage4P43Elevators({
	bedrockRoot = defaultBedrockRoot,
	built = false,
	repositoryRoot = defaultRepositoryRoot,
	trackingRoot = defaultBedrockRoot
} = {}) {
	const [matrix, queue, english, chinese, contacts, linear, worldPort] = await Promise.all([
		readJson(resolve(trackingRoot, "data", "migration-matrix.json")),
		readJson(resolve(trackingRoot, "data", "stage4-work-queue.json")),
		readFile(resolve(bedrockRoot, "resource_pack", "texts", "en_US.lang"), "utf8"),
		readFile(resolve(bedrockRoot, "resource_pack", "texts", "zh_CN.lang"), "utf8"),
		readFile(resolve(bedrockRoot, "behavior_pack", "scripts", "contraptions", "elevator-contact-runtime.js"), "utf8"),
		readFile(resolve(bedrockRoot, "behavior_pack", "scripts", "contraptions", "linear-actuator-runtime.js"), "utf8"),
		readFile(resolve(bedrockRoot, "behavior_pack", "scripts", "contraptions", "contraption-runtime.js"), "utf8")
	]);
	validateMigrationMatrix(matrix);
	validateStage4WorkQueue(queue, matrix);
	const entries = matrix.entries.filter(entry => P43_ACCEPTANCE_IDS.has(entry.acceptanceId));
	if (entries.length !== P43_ACCEPTANCE_IDS.size
		|| entries.some(entry => entry.status !== "static_verified" || stage4PackageFor(entry) !== "P4.3" || entry.persistenceSchema !== 2))
		throw new Error("P4.3 acceptance entries must be static-verified with column and pulley persistence");
	for (const entry of entries) {
		const queued = queue.entries.find(candidate => candidate.acceptanceId === entry.acceptanceId);
		if (!queued || queued.deliveryPackage !== "completed:P4.3")
			throw new Error(`P4.3 queue entry ${entry.acceptanceId} must be completed`);
	}
	for (const required of [
		"ElevatorColumnRegistry",
		"requestElevatorPulleyForColumn({",
		"notifyElevatorContactReached",
		"createbedrock:powering",
		"ShardedStateStore"
	])
		if (!contacts.includes(required))
			throw new Error(`P4.3 contact runtime is missing ${required}`);
	for (const required of [
		"createbedrock:elevator_pulley",
		"requestElevatorPulleyForColumn",
		"targetDistance",
		"sampleDynamicAssemblyMotionContacts"
	])
		if (!linear.includes(required))
			throw new Error(`P4.3 pulley runtime is missing ${required}`);
	if (!worldPort.includes("sampleDynamicAssemblyMotionContacts"))
		throw new Error("P4.3 requires shared moving-contact sampling after pulley transforms");
	for (const identifier of ["elevator_contact", "elevator_pulley"]) {
		const block = await readJson(resolve(bedrockRoot, "behavior_pack", "blocks", `${identifier}.json`));
		if (block["minecraft:block"]?.description?.identifier !== `createbedrock:${identifier}`)
			throw new Error(`P4.3 block ${identifier} has an invalid identifier`);
		requireLanguage(english.split(/\r?\n/), `tile.createbedrock:${identifier}.name`);
		requireLanguage(chinese.split(/\r?\n/), `tile.createbedrock:${identifier}.name`);
	}
	const contactBlock = await readJson(resolve(bedrockRoot, "behavior_pack", "blocks", "elevator_contact.json"));
	if (contactBlock["minecraft:block"]?.components?.["minecraft:geometry"] !== "geometry.createbedrock.elevator_contact"
		|| contactBlock["minecraft:block"]?.permutations?.[0]?.components?.["minecraft:redstone_producer"]?.power !== 15)
		throw new Error("P4.3 Elevator Contact must retain its source-specific visual and edge-triggered native output");
	await requireFile(resolve(bedrockRoot, "behavior_pack", "recipes", "elevator_pulley.json"), "P4.3 Elevator Pulley recipe");
	await requireFile(resolve(bedrockRoot, "behavior_pack", "loot_tables", "blocks", "elevator_pulley.json"), "P4.3 Elevator Pulley loot");
	if (!await isAbsent(resolve(bedrockRoot, "behavior_pack", "recipes", "elevator_contact.json")))
		throw new Error("P4.3 Elevator Contact must not invent a recipe absent from the Java acquisition path");
	for (const source of [
		"src/generated/resources/data/create/recipe/crafting/kinetics/elevator_pulley.json",
		"src/generated/resources/data/create/loot_table/blocks/elevator_contact.json",
		"src/main/resources/assets/create/models/block/elevator_contact/block.json",
		"src/main/resources/assets/create/models/block/elevator_pulley/block.json"
	])
		await requireFile(resolve(repositoryRoot, source), `P4.3 Java source ${source}`);
	if (built) {
		for (const geometry of ["elevator_contact", "elevator_pulley"])
			await requireFile(resolve(bedrockRoot, "resource_pack", "models", "blocks", `${geometry}.geo.json`), `Built P4.3 ${geometry} geometry`);
	}
	return { blocks: 2, entries: entries.length, movingContactOutput: "native_edge", persistentDomains: 2 };
}
