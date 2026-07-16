import { constants } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateMigrationMatrix } from "./migration-matrix-schema.mjs";
import { stage4PackageFor, validateStage4WorkQueue } from "./stage4-work-queue-schema.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");
const defaultRepositoryRoot = resolve(defaultBedrockRoot, "..");
const P41_ACCEPTANCE_IDS = new Set([
	"CONTRAPTIONS-CONTRAPTION-ENTITY",
	"CONTRAPTIONS-STATIONARY-CONTRAPTION-ENTITY",
	"CONTRAPTIONS-CONTRAPTION-CONTROLS-BLOCK",
	"CONTRAPTIONS-CONTRAPTION-CONTROLS-BLOCK_ENTITY"
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

export async function validateStage4P41Foundation({
	bedrockRoot = defaultBedrockRoot,
	built = false,
	repositoryRoot = defaultRepositoryRoot,
	trackingRoot = defaultBedrockRoot
} = {}) {
	const [matrix, queue, english, chinese] = await Promise.all([
		readJson(resolve(trackingRoot, "data", "migration-matrix.json")),
		readJson(resolve(trackingRoot, "data", "stage4-work-queue.json")),
		readFile(resolve(bedrockRoot, "resource_pack", "texts", "en_US.lang"), "utf8"),
		readFile(resolve(bedrockRoot, "resource_pack", "texts", "zh_CN.lang"), "utf8")
	]);
	validateMigrationMatrix(matrix);
	validateStage4WorkQueue(queue, matrix);
	const matrixEntries = matrix.entries.filter(entry => P41_ACCEPTANCE_IDS.has(entry.acceptanceId));
	if (matrixEntries.length !== P41_ACCEPTANCE_IDS.size || matrixEntries.some(entry => entry.status !== "static_verified" || stage4PackageFor(entry) !== "P4.1"))
		throw new Error("P4.1 acceptance entries must be statically verified and assigned to P4.1");
	for (const entry of matrixEntries) {
		const queued = queue.entries.find(candidate => candidate.acceptanceId === entry.acceptanceId);
		if (!queued || queued.deliveryPackage !== "completed:P4.1")
			throw new Error(`P4.1 queue entry ${entry.acceptanceId} must be completed`);
	}
	for (const identifier of ["contraption", "stationary_contraption"]) {
		const entity = await readJson(resolve(bedrockRoot, "behavior_pack", "entities", `${identifier}.json`));
		const description = entity["minecraft:entity"]?.description;
		if (description?.identifier !== `createbedrock:${identifier}` || description.is_spawnable !== false || description.is_summonable !== false)
			throw new Error(`${identifier} must be a non-spawnable dynamic-assembly projection`);
		const client = await readJson(resolve(bedrockRoot, "resource_pack", "entity", `${identifier}.entity.json`));
		const clientDescription = client["minecraft:client_entity"]?.description;
		if (clientDescription?.identifier !== `createbedrock:${identifier}`
			|| clientDescription.geometry?.default !== "geometry.createbedrock.contraption_marker"
			|| !clientDescription.render_controllers?.includes("controller.render.createbedrock.contraption"))
			throw new Error(`${identifier} client projection must use the contraption marker renderer`);
	}
	const controls = await readJson(resolve(bedrockRoot, "behavior_pack", "blocks", "contraption_controls.json"));
	const block = controls["minecraft:block"];
	if (block?.description?.identifier !== "createbedrock:contraption_controls"
		|| !Array.isArray(block.description.properties?.["createbedrock:disabled"])
		|| block.components?.["minecraft:geometry"] !== "geometry.createbedrock.contraption_controls"
		|| block.components?.["minecraft:loot"] !== "loot_tables/blocks/contraption_controls.json")
		throw new Error("Contraption Controls must retain its distinct identifier, state, geometry, and loot");
	const loot = await readJson(resolve(bedrockRoot, "behavior_pack", "loot_tables", "blocks", "contraption_controls.json"));
	if (loot.pools?.[0]?.entries?.[0]?.name !== "createbedrock:contraption_controls")
		throw new Error("Contraption Controls must self-drop");
	requireLanguage(english.split(/\r?\n/), "tile.createbedrock:contraption_controls.name");
	requireLanguage(chinese.split(/\r?\n/), "tile.createbedrock:contraption_controls.name");
	await requireFile(resolve(repositoryRoot, "src", "generated", "resources", "data", "create", "recipe", "crafting", "kinetics", "contraption_controls.json"), "Java Contraption Controls recipe");
	if (!await isAbsent(resolve(bedrockRoot, "behavior_pack", "recipes", "contraption_controls.json")))
		throw new Error("Contraption Controls must not invent a Bedrock recipe while Electron Tube is unported");
	if (built)
		await requireFile(resolve(bedrockRoot, "resource_pack", "models", "blocks", "contraption_controls.geo.json"), "Built Contraption Controls geometry");
	return { deferredSurvivalAcquisition: "create:electron_tube", entries: matrixEntries.length, projections: 2 };
}
