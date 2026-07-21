import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildNativeRecipes, renderNativeRecipeFiles, validateNativeRecipes } from "./native-recipes.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(bedrockRoot, "..");
const document = await buildNativeRecipes({ bedrockRoot, repositoryRoot });
const coverage = validateNativeRecipes(document);
const outputRoot = resolve(bedrockRoot, "behavior_pack", "recipes", "generated");

await mkdir(resolve(bedrockRoot, "data", "recipes"), { recursive: true });
await writeFile(resolve(bedrockRoot, "data", "recipes", "native.json"), `${JSON.stringify(document, null, "\t")}\n`);
// This subtree is owned solely by this converter. Removing it first ensures a
// deleted or reclassified Java recipe cannot survive as a stale pack recipe.
await rm(resolve(outputRoot, "p7_2"), { force: true, recursive: true });
for (const [relativePath, contents] of renderNativeRecipeFiles(document)) {
	const output = resolve(outputRoot, relativePath);
	await mkdir(dirname(output), { recursive: true });
	await writeFile(output, contents);
}

console.log(`P7.2 native recipes: ${coverage.status.emittable} emitted, ${coverage.status.blocked_missing_content} blocked by P7.1 content, ${coverage.status.blocked_tag_projection} blocked by tag projection, and ${coverage.status.blocked_platform_semantics} blocked by Bedrock-native semantic gaps.`);
