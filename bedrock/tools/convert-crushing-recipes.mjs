import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	mapJavaProcessingIdentifier,
	processingImportReport,
	supportsProcessingRecipeItems
} from "./processing-recipe-import.js";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(bedrockRoot, "..");
const sourceRoot = resolve(repositoryRoot, "src/generated/resources/data/create/recipe/crushing");
const outputRoot = resolve(bedrockRoot, "behavior_pack/scripts/processing/generated");

async function findJsonFiles(directory) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory())
			files.push(...await findJsonFiles(path));
		else if (entry.name.endsWith(".json"))
			files.push(path);
	}
	return files;
}

const recipes = [];
const records = [];
for (const file of await findJsonFiles(sourceRoot)) {
	const source = JSON.parse(await readFile(file, "utf8"));
	const sourcePath = relative(sourceRoot, file).replace(/\\/g, "/").replace(/\.json$/, "");
	const input = source.ingredients?.length === 1 ? source.ingredients[0] : undefined;
	const outputs = source.results?.every(result => typeof result.id === "string");
	if (sourcePath.startsWith("compat/")) {
		records.push({ source: sourcePath, status: "unsupported_dependency", reason: "compatibility_recipe" });
		continue;
	}
	if (source.type !== "create:crushing" || typeof input?.item !== "string" || !outputs) {
		records.push({ source: sourcePath, status: "manual_specification", reason: "unsupported_recipe_shape" });
		continue;
	}

	const recipe = {
		id: `create:crushing/${sourcePath}`,
		input: { typeId: mapJavaProcessingIdentifier(input.item), count: input.count ?? 1 },
		processingTicks: source.processing_time ?? 100,
		outputs: source.results.map(result => ({
			typeId: mapJavaProcessingIdentifier(result.id),
			count: result.count ?? 1,
			chance: result.chance ?? 1
		}))
	};
	if (!supportsProcessingRecipeItems([recipe.input.typeId, ...recipe.outputs.map(result => result.typeId)])) {
		records.push({ source: sourcePath, status: "unsupported_dependency", reason: "unavailable_item" });
		continue;
	}
	recipes.push(recipe);
	records.push({ source: sourcePath, status: "migrated", recipeId: recipe.id });
}

recipes.sort((left, right) => left.id.localeCompare(right.id));
await mkdir(outputRoot, { recursive: true });
await mkdir(resolve(bedrockRoot, "data", "recipes"), { recursive: true });
await writeFile(resolve(outputRoot, "crushing-recipes.js"), `// Generated from src/generated/resources/data/create/recipe/crushing.\nexport const CRUSHING_RECIPES = ${JSON.stringify(recipes, null, "\t")};\n`);
await writeFile(resolve(bedrockRoot, "data", "recipes", "crushing.json"), `${JSON.stringify(recipes, null, "\t")}\n`);
const report = processingImportReport("crushing", records);
await writeFile(resolve(bedrockRoot, "data", "recipes", "crushing-import-report.json"), `${JSON.stringify(report, null, "\t")}\n`);
console.log(`Crushing recipes: ${report.summary.migrated} migrated, ${report.summary.unsupported_dependency} blocked by dependencies, ${report.summary.manual_specification} need manual specifications.`);
