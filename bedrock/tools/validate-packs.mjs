import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { validateMigrationMatrix } from "./migration-matrix-schema.mjs";
import { validateStage2FoundationContract } from "./stage2-foundation-contract.mjs";
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
import { validateContentMaterialFoundation } from "./content-material-foundation-contract.mjs";
import { validateContentMaterialC2Execution } from "./content-material-c2-execution-contract.mjs";
import { validateCardboardEquipment } from "./content-material-cardboard-equipment-contract.mjs";
import { validateCrushedRawMaterials } from "./content-material-crushed-raw-contract.mjs";
import { validateBlazeBurnerContract } from "./content-material-blaze-burner-contract.mjs";
import { validateSandpaperMaterials } from "./content-material-sandpaper-contract.mjs";
import { validateSailMaterials } from "./content-material-sail-contract.mjs";
import { validateLegacyMaterials } from "./content-material-legacy-contract.mjs";
import { validateTableClothMaterials } from "./content-material-table-cloth-contract.mjs";
import { validateNozzleMaterial } from "./content-material-nozzle-contract.mjs";
import { validateContentMaterialDisplayPackage } from "./content-material-display-contract.mjs";
import { validateContentMaterialGauges } from "./content-material-gauge-contract.mjs";
import { validateContentMaterialPersistent } from "./content-material-persistent-contract.mjs";
import { validateContentMaterialResources } from "./content-material-resource-contract.mjs";
import { validateContentMaterialSpecialItems } from "./content-material-special-item-contract.mjs";
import { validateContentMaterialStates } from "./content-material-state-contract.mjs";
import { validateStage3RedstoneDecision } from "./s3-14-redstone-decision-schema.mjs";
import { validateS314CapabilityPlan } from "./s3-14-capability-plan-schema.mjs";
import { validateStage3PlatformAcceptance } from "./s3-15-platform-acceptance-schema.mjs";
import { validateStage3StaticClosure } from "./stage3-static-closure-contract.mjs";
import { validateStage3VisualSourceContract } from "./stage3-visual-contract.mjs";
import { validateStage3WorkQueue } from "./stage3-work-queue-schema.mjs";
import { validateStage4DynamicFoundation } from "./stage4-dynamic-foundation-contract.mjs";
import { validateStage4P41Foundation } from "./stage4-p41-foundation-contract.mjs";
import { validateStage4P42LinearActuators } from "./stage4-p42-linear-actuator-contract.mjs";
import { validateStage4P43Elevators } from "./stage4-p43-elevator-contract.mjs";
import { validateStage4P44Actors } from "./stage4-p44-actor-contract.mjs";
import { validateStage4P45MinecartContraptions } from "./stage4-p45-minecart-contraption-contract.mjs";
import { validateStage4P46Stickers } from "./stage4-p46-sticker-contract.mjs";
import { validateStage4WorkQueue } from "./stage4-work-queue-schema.mjs";

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
const stage4WorkQueue = await readJson(resolve(bedrockRoot, "data", "stage4-work-queue.json"));
validateMigrationMatrix(migrationMatrix);
const stage2Foundation = await validateStage2FoundationContract({ bedrockRoot });
validateStage3WorkQueue(stage3WorkQueue, migrationMatrix);
const stage4WorkQueueCoverage = validateStage4WorkQueue(stage4WorkQueue, migrationMatrix);
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
const contentMaterialFoundation = await validateContentMaterialFoundation();
const contentMaterialC2Execution = await validateContentMaterialC2Execution();
const cardboardEquipment = await validateCardboardEquipment();
const crushedRawMaterials = await validateCrushedRawMaterials();
const blazeBurner = await validateBlazeBurnerContract();
const sandpaperMaterials = await validateSandpaperMaterials();
const sailMaterials = await validateSailMaterials();
const legacyMaterials = await validateLegacyMaterials();
const tableClothMaterials = await validateTableClothMaterials();
const nozzleMaterial = await validateNozzleMaterial();
const contentMaterialDisplay = await validateContentMaterialDisplayPackage();
const contentMaterialGauges = await validateContentMaterialGauges();
const contentMaterialPersistent = await validateContentMaterialPersistent();
const contentMaterialResources = await validateContentMaterialResources();
const contentMaterialSpecialItems = await validateContentMaterialSpecialItems();
const contentMaterialStates = await validateContentMaterialStates();
const redstoneDecision = await validateStage3RedstoneDecision();
const redstoneCapabilityPlan = await validateS314CapabilityPlan({
	dataPath: resolve(bedrockRoot, "data", "s3-14-capability-plan.json"),
	repositoryRoot
});
const platformAcceptance = await validateStage3PlatformAcceptance();
const staticClosure = await validateStage3StaticClosure();
const visualContract = await validateStage3VisualSourceContract();
const stage4DynamicFoundation = await validateStage4DynamicFoundation({ bedrockRoot });
const stage4P41Foundation = await validateStage4P41Foundation({ bedrockRoot, repositoryRoot });
const stage4P42LinearActuators = await validateStage4P42LinearActuators({ bedrockRoot, repositoryRoot });
const stage4P43Elevators = await validateStage4P43Elevators({ bedrockRoot, repositoryRoot });
const stage4P44Actors = await validateStage4P44Actors({ bedrockRoot, repositoryRoot });
const stage4P45MinecartContraptions = await validateStage4P45MinecartContraptions({ bedrockRoot, repositoryRoot });
const stage4P46Stickers = await validateStage4P46Stickers({ bedrockRoot, repositoryRoot });

console.log(`Bedrock manifests, JSON files, JavaScript syntax, ${stage2Foundation.entries} Stage-2 foundation records across ${stage2Foundation.blocks} blocks and ${stage2Foundation.directRecipes} direct recipes, ${contentContract.contentBlocks} Stage-3 content blocks, ${contentMaterialFoundation.oreFeatures} C0 zinc ore features, ${contentMaterialResources.contentBlocks} C1 resource blocks, ${contentMaterialStates.contentBlocks} C1 state blocks, ${contentMaterialPersistent.persistentBlocks + contentMaterialGauges.persistentBlocks + contentMaterialDisplay.persistentBlocks + contentMaterialC2Execution.blocks} C2 persistent blocks, ${cardboardEquipment.items} cardboard-equipment items, ${crushedRawMaterials.crushedItems} crushed-raw materials, ${blazeBurner.blocks} Blaze Burner blocks, ${sandpaperMaterials.papers} sand-paper items, ${sailMaterials.sailBlocks} windmill sail blocks, ${legacyMaterials.items} legacy materials, ${tableClothMaterials.blocks} Table Cloth shop blocks, ${nozzleMaterial.blocks} kinetic Nozzle block, and ${contentMaterialResources.contentItems + contentMaterialSpecialItems.contentItems} C1 content items with ${contentMaterialResources.deferredSurvivalAcquisitions.length + contentMaterialSpecialItems.deferredSurvivalAcquisitions.length + contentMaterialPersistent.deferredSurvivalAcquisitions.length + contentMaterialDisplay.deferredSurvivalAcquisitions.length} explicit deferred acquisition chains, ${kineticContract.blocks} S3-9 kinetic blocks, ${logisticsContract.blocks} S3-10 logistics blocks, ${processingContract.blocks} S3-11 processing blocks, ${fluidContract.blocks} S3-12 fluid blocks, ${visualContract.tankSegments} S3-13 Tank visual segments, ${redstoneDecision.staticVerifiedPendingPlatformAcceptance} static-verified S3-14 redstone devices across ${redstoneDecision.matrixStaticVerified} acceptance records, ${redstoneCapabilityPlan.devices} planned S3-14 semantic devices, ${platformAcceptance.pendingPlatforms}/${platformAcceptance.platforms} pending S3-15 platform records, the ${staticClosure.entries}-entry static closure, ${stage3WorkQueue.entries.length}-entry Stage-3 work queue, ${stage4WorkQueueCoverage.entries}-entry Stage-4 work queue, ${stage4DynamicFoundation.dynamicBlocks}-block Stage-4 dynamic foundation, ${stage4P41Foundation.entries} static-verified P4.1 entries with ${stage4P41Foundation.deferredSurvivalAcquisition} acquisition deferred, ${contentSpecificationCoverage.entries} S3-8B content specifications, ${kineticSpecificationCoverage.entries} S3-9 kinetic specifications, ${logisticsSpecificationCoverage.entries} S3-10 logistics specifications, ${processingSpecificationCoverage.entries} S3-11 processing specifications, and ${fluidSpecificationCoverage.entries} S3-12 fluid specifications are valid.`);
