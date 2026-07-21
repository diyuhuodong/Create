import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildMechanicalCraftingRecipes, renderMechanicalCraftingRecipes, validateMechanicalCraftingRecipes } from "./mechanical-crafting-recipes.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(bedrockRoot, "..");
const document = await buildMechanicalCraftingRecipes({ repositoryRoot });
const coverage = validateMechanicalCraftingRecipes(document);

await mkdir(resolve(bedrockRoot, "data", "recipes"), { recursive: true });
await mkdir(resolve(bedrockRoot, "behavior_pack", "scripts", "processing", "generated"), { recursive: true });
await writeFile(resolve(bedrockRoot, "data", "recipes", "mechanical-crafting.json"), `${JSON.stringify(document, null, "\t")}\n`);
await writeFile(resolve(bedrockRoot, "behavior_pack", "scripts", "processing", "generated", "mechanical-crafting-recipes.js"), renderMechanicalCraftingRecipes(document.recipes));
console.log(`Mechanical-crafting IR: ${coverage.recipes} recipes captured.`);
