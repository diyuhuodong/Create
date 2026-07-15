import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { validateMigrationMatrix } from "./migration-matrix-schema.mjs";
import { validateStage3SourceContentContract } from "./stage3-content-contract.mjs";
import { validateStage3ContentSpecifications } from "./stage3-content-specification-schema.mjs";
import { validateStage3KineticSourceContract } from "./stage3-kinetic-contract.mjs";
import { validateStage3KineticSpecifications } from "./stage3-kinetic-specification-schema.mjs";
import { validateStage3LogisticsSourceContract } from "./stage3-logistics-contract.mjs";
import { validateStage3LogisticsSpecifications } from "./stage3-logistics-specification-schema.mjs";
import { validateStage3ProcessingSourceContract } from "./stage3-processing-contract.mjs";
import { validateStage3ProcessingSpecifications } from "./stage3-processing-specification-schema.mjs";
import { validateStage3FluidSpecifications } from "./stage3-fluid-specification-schema.mjs";
import { validateStage3FluidSourceContract } from "./stage3-fluid-contract.mjs";
import { validateStage3WorkQueue } from "./stage3-work-queue-schema.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(bedrockRoot, "..");

async function fileExists(file) {
	try {
		return (await stat(file)).isFile();
	} catch {
		return false;
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

async function filesWithExtension(directory, extension) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const file = resolve(directory, entry.name);
		if (entry.isDirectory())
			files.push(...await filesWithExtension(file, extension));
		else if (extname(entry.name) === extension)
			files.push(file);
	}
	return files;
}

async function readJson(file) {
	try {
		return JSON.parse(await readFile(file, "utf8"));
	} catch (error) {
		throw new Error(`Invalid JSON in ${file}: ${error.message}`);
	}
}

for (const directory of ["behavior_pack", "resource_pack"]) {
	for (const file of await jsonFiles(resolve(bedrockRoot, directory)))
		await readJson(file);
}

const behaviorManifest = await readJson(resolve(bedrockRoot, "behavior_pack", "manifest.json"));
const resourceManifest = await readJson(resolve(bedrockRoot, "resource_pack", "manifest.json"));
const terrainAtlas = await readJson(resolve(bedrockRoot, "resource_pack", "textures", "terrain_texture.json"));
const itemAtlas = await readJson(resolve(bedrockRoot, "resource_pack", "textures", "item_texture.json"));
const migrationMatrix = await readJson(resolve(bedrockRoot, "data", "migration-matrix.json"));
const stage3ContentSpecifications = await readJson(resolve(bedrockRoot, "data", "stage3-content-specifications.json"));
const stage3KineticSpecifications = await readJson(resolve(bedrockRoot, "data", "stage3-kinetic-specifications.json"));
const stage3LogisticsSpecifications = await readJson(resolve(bedrockRoot, "data", "stage3-logistics-specifications.json"));
const stage3ProcessingSpecifications = await readJson(resolve(bedrockRoot, "data", "stage3-processing-specifications.json"));
const stage3FluidSpecifications = await readJson(resolve(bedrockRoot, "data", "stage3-fluid-specifications.json"));
const stage3WorkQueue = await readJson(resolve(bedrockRoot, "data", "stage3-work-queue.json"));
validateMigrationMatrix(migrationMatrix);
validateStage3WorkQueue(stage3WorkQueue, migrationMatrix);
const contentSpecificationCoverage = validateStage3ContentSpecifications(stage3ContentSpecifications, stage3WorkQueue);
const kineticSpecificationCoverage = validateStage3KineticSpecifications(stage3KineticSpecifications, stage3WorkQueue);
const logisticsSpecificationCoverage = validateStage3LogisticsSpecifications(stage3LogisticsSpecifications, stage3WorkQueue);
const processingSpecificationCoverage = validateStage3ProcessingSpecifications(stage3ProcessingSpecifications, stage3WorkQueue);
const fluidSpecificationCoverage = validateStage3FluidSpecifications(stage3FluidSpecifications, stage3WorkQueue);
for (const entry of stage3ContentSpecifications.entries) {
	const sourcePaths = [
		...entry.sourceModelPaths,
		...entry.sourceRecipePaths,
		...entry.sourceTexturePaths,
		...(entry.sourceLootPath ? [entry.sourceLootPath] : [])
	];
	for (const sourcePath of sourcePaths) {
		if (!await fileExists(resolve(repositoryRoot, sourcePath)))
			throw new Error(`Content specification ${entry.acceptanceId} references missing Java source ${sourcePath}.`);
	}
}
for (const entry of stage3KineticSpecifications.entries) {
	for (const sourcePath of entry.javaEvidencePaths) {
		if (!await fileExists(resolve(repositoryRoot, sourcePath)))
			throw new Error(`Kinetic specification ${entry.acceptanceId} references missing Java source ${sourcePath}.`);
	}
}
for (const entry of stage3LogisticsSpecifications.entries) {
	for (const sourcePath of entry.javaEvidencePaths) {
		if (!await fileExists(resolve(repositoryRoot, sourcePath)))
			throw new Error(`Logistics specification ${entry.acceptanceId} references missing Java source ${sourcePath}.`);
	}
}
for (const entry of stage3ProcessingSpecifications.entries) {
	for (const sourcePath of entry.javaEvidencePaths) {
		if (!await fileExists(resolve(repositoryRoot, sourcePath)))
			throw new Error(`Processing specification ${entry.acceptanceId} references missing Java source ${sourcePath}.`);
	}
}
for (const entry of stage3FluidSpecifications.entries) {
	for (const sourcePath of entry.javaEvidencePaths) {
		if (!await fileExists(resolve(repositoryRoot, sourcePath)))
			throw new Error(`Fluid specification ${entry.acceptanceId} references missing Java source ${sourcePath}.`);
	}
}
const allUuids = [
	behaviorManifest.header.uuid,
	resourceManifest.header.uuid,
	...behaviorManifest.modules.map(module => module.uuid),
	...resourceManifest.modules.map(module => module.uuid)
];

if (new Set(allUuids).size !== allUuids.length)
	throw new Error("Behavior and resource pack UUIDs must be unique.");

const behaviorDependsOnResource = behaviorManifest.dependencies.some(dependency => dependency.uuid === resourceManifest.header.uuid);
const resourceDependsOnBehavior = resourceManifest.dependencies.some(dependency => dependency.uuid === behaviorManifest.header.uuid);
if (!behaviorDependsOnResource || !resourceDependsOnBehavior)
	throw new Error("Behavior and resource manifests must depend on each other.");

if (!behaviorManifest.modules.some(module => module.type === "script" && module.entry === "scripts/main.js"))
	throw new Error("Behavior pack must define scripts/main.js as its script entry point.");

const terrainTextures = new Set(Object.keys(terrainAtlas.texture_data ?? {}));
const itemTextures = new Set(Object.keys(itemAtlas.texture_data ?? {}));
for (const blockFile of await jsonFiles(resolve(bedrockRoot, "behavior_pack", "blocks"))) {
	const block = await readJson(blockFile);
	const components = block["minecraft:block"]?.components ?? {};
	const lootPath = components["minecraft:loot"];
	if (typeof lootPath === "string") {
		const lootFile = resolve(bedrockRoot, "behavior_pack", lootPath);
		await readJson(lootFile);
	}
	const instances = [
		components["minecraft:material_instances"],
		components["minecraft:item_visual"]?.material_instances
	];
	for (const materialInstances of instances) {
		for (const instance of Object.values(materialInstances ?? {})) {
			const texture = instance?.texture;
			if (typeof texture === "string" && texture.startsWith("createbedrock_") && !terrainTextures.has(texture))
				throw new Error(`Block texture ${texture} in ${blockFile} is missing from terrain_texture.json.`);
		}
	}
}

for (const itemFile of await jsonFiles(resolve(bedrockRoot, "behavior_pack", "items"))) {
	const item = await readJson(itemFile);
	const icon = item["minecraft:item"]?.components?.["minecraft:icon"];
	if (typeof icon === "string" && icon.startsWith("createbedrock_") && !itemTextures.has(icon))
		throw new Error(`Item texture ${icon} in ${itemFile} is missing from item_texture.json.`);
}

for (const script of await filesWithExtension(resolve(bedrockRoot, "behavior_pack", "scripts"), ".js")) {
	const result = spawnSync(process.execPath, ["--check", script], { encoding: "utf8" });
	if (result.status !== 0)
		throw new Error(`Invalid JavaScript in ${script}: ${result.stderr || result.stdout}`);
}

const contentContract = await validateStage3SourceContentContract();
const kineticContract = await validateStage3KineticSourceContract();
const logisticsContract = await validateStage3LogisticsSourceContract();
const processingContract = await validateStage3ProcessingSourceContract();
const fluidContract = await validateStage3FluidSourceContract();

console.log(`Bedrock manifests, JSON files, JavaScript syntax, ${contentContract.contentBlocks} Stage-3 content blocks, ${kineticContract.blocks} S3-9 kinetic blocks, ${logisticsContract.blocks} S3-10 logistics blocks, ${processingContract.blocks} S3-11 processing blocks, ${fluidContract.blocks} S3-12 fluid blocks, the ${stage3WorkQueue.entries.length}-entry work queue, ${contentSpecificationCoverage.entries} S3-8B content specifications, ${kineticSpecificationCoverage.entries} S3-9 kinetic specifications, ${logisticsSpecificationCoverage.entries} S3-10 logistics specifications, ${processingSpecificationCoverage.entries} S3-11 processing specifications, and ${fluidSpecificationCoverage.entries} S3-12 fluid specifications are valid.`);
