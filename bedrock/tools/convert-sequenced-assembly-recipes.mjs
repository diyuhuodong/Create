import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildSequencedAssemblyRecipes, renderSequencedAssemblyRecipes, validateSequencedAssemblyRecipes } from "./sequenced-assembly-recipes.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(bedrockRoot, "..");
const document = await buildSequencedAssemblyRecipes({ repositoryRoot });
const coverage = validateSequencedAssemblyRecipes(document);

await mkdir(resolve(bedrockRoot, "data", "recipes"), { recursive: true });
await mkdir(resolve(bedrockRoot, "behavior_pack", "scripts", "processing", "generated"), { recursive: true });
await writeFile(resolve(bedrockRoot, "data", "recipes", "sequenced-assembly.json"), `${JSON.stringify(document, null, "\t")}\n`);
await writeFile(resolve(bedrockRoot, "behavior_pack", "scripts", "processing", "generated", "sequenced-assembly-recipes.js"), renderSequencedAssemblyRecipes(document.recipes));
console.log(`Sequenced-assembly IR: ${coverage.recipes} recipes and ${coverage.steps} steps captured.`);
