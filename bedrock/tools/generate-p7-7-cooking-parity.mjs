import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildP77CookingParityCatalog, renderP77CookingParityRecipes } from "./p7-7-cooking-parity.mjs";

const bedrockRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = resolve(bedrockRoot, "data");
const nativeRecipes = JSON.parse(await readFile(resolve(dataRoot, "recipes", "native.json"), "utf8"));
const catalog = buildP77CookingParityCatalog(nativeRecipes);

await mkdir(resolve(bedrockRoot, "behavior_pack", "scripts", "processing", "generated"), { recursive: true });
await writeFile(resolve(dataRoot, "p7-7-cooking-parity.json"), `${JSON.stringify(catalog, null, "\t")}\n`);
await writeFile(resolve(bedrockRoot, "behavior_pack", "scripts", "processing", "generated", "cooking-parity-recipes.js"), renderP77CookingParityRecipes(catalog));
console.log(`P7.7 cooking parity: ${catalog.summary.recipes} recipes, ${catalog.summary.processingTimeOverrides} time overrides, ${catalog.summary.experienceOverrides} experience overrides.`);
