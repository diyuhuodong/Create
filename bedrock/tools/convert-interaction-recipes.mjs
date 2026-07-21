import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildInteractionRecipes, renderInteractionRecipes, validateInteractionRecipes } from "./interaction-recipes.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(bedrockRoot, "..");
const document = await buildInteractionRecipes({ repositoryRoot });
const coverage = validateInteractionRecipes(document);

await mkdir(resolve(bedrockRoot, "data", "recipes"), { recursive: true });
await mkdir(resolve(bedrockRoot, "behavior_pack", "scripts", "processing", "generated"), { recursive: true });
await writeFile(resolve(bedrockRoot, "data", "recipes", "interactions.json"), `${JSON.stringify(document, null, "\t")}\n`);
await writeFile(resolve(bedrockRoot, "behavior_pack", "scripts", "processing", "generated", "interaction-recipes.js"), renderInteractionRecipes(document.recipes));
console.log(`Interaction IR: ${coverage.recipes}/${coverage.records} recipes compiled, ${coverage.status.external_compat} external, ${coverage.status.manual_specification} manual.`);
