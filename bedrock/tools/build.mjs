import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { importJavaAssets } from "./import-java-assets.mjs";
import { convertJavaModels } from "./convert-java-models.mjs";

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
console.log(`Built Bedrock packs in ${buildRoot}; staged ${importedTextureCount} Java textures and converted ${convertedModelCount} Java models.`);
