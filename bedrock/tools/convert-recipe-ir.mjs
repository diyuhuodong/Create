import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildRecipeIr, validateRecipeIr } from "./recipe-ir.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(bedrockRoot, "..");
const document = await buildRecipeIr({ repositoryRoot });
const coverage = validateRecipeIr(document);

await mkdir(resolve(bedrockRoot, "data", "recipes"), { recursive: true });
await writeFile(resolve(bedrockRoot, "data", "recipes", "recipe-ir.json"), `${JSON.stringify(document, null, "\t")}\n`);
console.log(`P7.2 recipe IR: ${coverage.recipes} Java recipes classified into ${Object.keys(coverage.strategies).length} execution strategies.`);
