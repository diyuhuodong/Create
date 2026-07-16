import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { importJavaAssets } from "./import-java-assets.mjs";
import { convertJavaModels } from "./convert-java-models.mjs";
import { generateStage3VisualTextures } from "./generate-stage3-visual-textures.mjs";
import { validateStage3BuiltContentContract } from "./stage3-content-contract.mjs";
import { validateStage3KineticSourceContract } from "./stage3-kinetic-contract.mjs";
import { validateStage3LogisticsSourceContract } from "./stage3-logistics-contract.mjs";
import { validateStage3ProcessingSourceContract } from "./stage3-processing-contract.mjs";
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
import { validateStage3RedstoneBuiltContract } from "./s3-14-redstone-device-contract.mjs";
import { validateStage3PlatformAcceptance } from "./s3-15-platform-acceptance-schema.mjs";
import { validateStage3BuiltVisualContract } from "./stage3-visual-contract.mjs";
import { validateStage4P41Foundation } from "./stage4-p41-foundation-contract.mjs";
import { validateStage4P42LinearActuators } from "./stage4-p42-linear-actuator-contract.mjs";
import { validateStage4P43Elevators } from "./stage4-p43-elevator-contract.mjs";
import { validateStage4P44Actors } from "./stage4-p44-actor-contract.mjs";
import { validateStage4P45MinecartContraptions } from "./stage4-p45-minecart-contraption-contract.mjs";
import { validateStage4P46Stickers } from "./stage4-p46-sticker-contract.mjs";
import { validateStage4P47Schematics } from "./stage4-p47-schematics-contract.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(toolDirectory, "..");
const buildRoot = resolve(bedrockRoot, "build");
const packs = ["behavior_pack", "resource_pack"];

await rm(buildRoot, { force: true, recursive: true });
await mkdir(buildRoot, { recursive: true });

for (const pack of packs) {
	await cp(resolve(bedrockRoot, pack), resolve(buildRoot, pack), {
		recursive: true,
		filter: source => !source.endsWith(".DS_Store")
	});
}

const generatedTextureCount = await generateStage3VisualTextures(resolve(buildRoot, "resource_pack"));
const importedTextureCount = await importJavaAssets(resolve(buildRoot, "resource_pack"));
const convertedModelCount = await convertJavaModels(resolve(buildRoot, "resource_pack"));
const contentContract = await validateStage3BuiltContentContract({ buildRoot });
const kineticContract = await validateStage3KineticSourceContract({ bedrockRoot: buildRoot, trackingRoot: bedrockRoot });
const logisticsContract = await validateStage3LogisticsSourceContract({ bedrockRoot: buildRoot, trackingRoot: bedrockRoot });
const processingContract = await validateStage3ProcessingSourceContract({ bedrockRoot: buildRoot, dataRoot: bedrockRoot });
const fluidContract = await validateStage3FluidSourceContract({ bedrockRoot: buildRoot, trackingRoot: bedrockRoot });
const contentMaterialFoundation = await validateContentMaterialFoundation({ bedrockRoot: buildRoot });
const contentMaterialC2Execution = await validateContentMaterialC2Execution({ bedrockRoot: buildRoot, built: true });
const cardboardEquipment = await validateCardboardEquipment({ bedrockRoot: buildRoot, built: true });
const crushedRawMaterials = await validateCrushedRawMaterials({ bedrockRoot: buildRoot, built: true });
const blazeBurner = await validateBlazeBurnerContract({ bedrockRoot: buildRoot, built: true });
const sandpaperMaterials = await validateSandpaperMaterials({ bedrockRoot: buildRoot, built: true });
const sailMaterials = await validateSailMaterials({ bedrockRoot: buildRoot, built: true });
const legacyMaterials = await validateLegacyMaterials({ bedrockRoot: buildRoot, built: true });
const tableClothMaterials = await validateTableClothMaterials({ bedrockRoot: buildRoot, built: true });
const nozzleMaterial = await validateNozzleMaterial({ bedrockRoot: buildRoot, built: true });
const contentMaterialDisplay = await validateContentMaterialDisplayPackage({ bedrockRoot: buildRoot, built: true });
const contentMaterialGauges = await validateContentMaterialGauges({ bedrockRoot: buildRoot, built: true });
const contentMaterialPersistent = await validateContentMaterialPersistent({ bedrockRoot: buildRoot, built: true });
const contentMaterialResources = await validateContentMaterialResources({ bedrockRoot: buildRoot, built: true });
const contentMaterialSpecialItems = await validateContentMaterialSpecialItems({ bedrockRoot: buildRoot, built: true });
const contentMaterialStates = await validateContentMaterialStates({ bedrockRoot: buildRoot, built: true });
const redstoneDecision = await validateStage3RedstoneDecision({ bedrockRoot: buildRoot });
const redstoneContract = await validateStage3RedstoneBuiltContract({ buildRoot });
const platformAcceptance = await validateStage3PlatformAcceptance({ bedrockRoot: buildRoot });
const visualContract = await validateStage3BuiltVisualContract({ buildRoot });
const stage4P41Foundation = await validateStage4P41Foundation({ bedrockRoot: buildRoot, built: true, trackingRoot: bedrockRoot });
const stage4P42LinearActuators = await validateStage4P42LinearActuators({ bedrockRoot: buildRoot, built: true, trackingRoot: bedrockRoot });
const stage4P43Elevators = await validateStage4P43Elevators({ bedrockRoot: buildRoot, built: true, trackingRoot: bedrockRoot });
const stage4P44Actors = await validateStage4P44Actors({ bedrockRoot: buildRoot, built: true, trackingRoot: bedrockRoot });
const stage4P45MinecartContraptions = await validateStage4P45MinecartContraptions({ bedrockRoot: buildRoot, built: true, trackingRoot: bedrockRoot });
const stage4P46Stickers = await validateStage4P46Stickers({ bedrockRoot: buildRoot, built: true, trackingRoot: bedrockRoot });
const stage4P47Schematics = await validateStage4P47Schematics({ bedrockRoot: buildRoot, built: true, trackingRoot: bedrockRoot });
console.log(`Built Bedrock packs in ${buildRoot}; generated ${generatedTextureCount} S3-13 fluid textures, staged ${importedTextureCount} Java assets, converted ${convertedModelCount} Java models, and verified ${contentContract.contentBlocks} Stage-3 content blocks, ${contentMaterialFoundation.oreFeatures} C0 zinc ore features, ${contentMaterialResources.contentBlocks} C1 resource blocks, ${contentMaterialStates.contentBlocks} C1 state blocks, ${contentMaterialPersistent.persistentBlocks + contentMaterialGauges.persistentBlocks + contentMaterialDisplay.persistentBlocks + contentMaterialC2Execution.blocks} C2 persistent blocks, ${cardboardEquipment.items} cardboard-equipment items, ${crushedRawMaterials.crushedItems} crushed-raw materials, ${blazeBurner.blocks} Blaze Burner blocks, ${sandpaperMaterials.papers} sand-paper items, ${sailMaterials.sailBlocks} windmill sail blocks, ${legacyMaterials.items} legacy materials, ${tableClothMaterials.blocks} Table Cloth shop blocks, ${nozzleMaterial.blocks} kinetic Nozzle block, and ${contentMaterialResources.contentItems + contentMaterialSpecialItems.contentItems} C1 content items with ${contentMaterialResources.deferredSurvivalAcquisitions.length + contentMaterialSpecialItems.deferredSurvivalAcquisitions.length + contentMaterialPersistent.deferredSurvivalAcquisitions.length + contentMaterialDisplay.deferredSurvivalAcquisitions.length} explicit deferred acquisition chains, ${kineticContract.blocks} S3-9 kinetic blocks, ${logisticsContract.blocks} S3-10 logistics blocks, ${processingContract.blocks} S3-11 processing blocks, ${fluidContract.blocks} S3-12 fluid blocks, ${visualContract.tankSegments} S3-13 Tank visual segments, ${redstoneDecision.staticVerifiedPendingPlatformAcceptance} static-verified S3-14 redstone devices across ${redstoneDecision.matrixStaticVerified} acceptance records (${redstoneContract.blocks} blocks and ${redstoneContract.items} item), ${stage4P41Foundation.entries} static-verified P4.1 entries, ${stage4P47Schematics.entries} static-verified P4.7 schematic entries, and ${platformAcceptance.pendingPlatforms}/${platformAcceptance.platforms} pending S3-15 platform records.`);
