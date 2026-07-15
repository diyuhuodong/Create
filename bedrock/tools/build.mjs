import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { importJavaAssets } from "./import-java-assets.mjs";
import { convertJavaModels } from "./convert-java-models.mjs";
import { validateStage3BuiltContentContract } from "./stage3-content-contract.mjs";
import { validateStage3KineticSourceContract } from "./stage3-kinetic-contract.mjs";
import { validateStage3LogisticsSourceContract } from "./stage3-logistics-contract.mjs";
import { validateStage3ProcessingSourceContract } from "./stage3-processing-contract.mjs";
import { validateStage3FluidSourceContract } from "./stage3-fluid-contract.mjs";

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

const importedTextureCount = await importJavaAssets(resolve(buildRoot, "resource_pack"));
const convertedModelCount = await convertJavaModels(resolve(buildRoot, "resource_pack"));
const contentContract = await validateStage3BuiltContentContract({ buildRoot });
const kineticContract = await validateStage3KineticSourceContract({ bedrockRoot: buildRoot });
const logisticsContract = await validateStage3LogisticsSourceContract({ bedrockRoot: buildRoot });
const processingContract = await validateStage3ProcessingSourceContract({ bedrockRoot: buildRoot });
const fluidContract = await validateStage3FluidSourceContract({ bedrockRoot: buildRoot });
console.log(`Built Bedrock packs in ${buildRoot}; staged ${importedTextureCount} Java textures, converted ${convertedModelCount} Java models, and verified ${contentContract.contentBlocks} Stage-3 content blocks, ${kineticContract.blocks} S3-9 kinetic blocks, ${logisticsContract.blocks} S3-10 logistics blocks, ${processingContract.blocks} S3-11 processing blocks, and ${fluidContract.blocks} S3-12 fluid blocks.`);
