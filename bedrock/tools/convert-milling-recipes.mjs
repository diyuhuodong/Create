import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	mapJavaProcessingIdentifier,
	processingImportReport,
	supportsProcessingRecipeItems
} from "./processing-recipe-import.js";
import { expandProcessingIngredient, processingTagProjections } from "./processing-tag-projections.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(bedrockRoot, "..");
const sourceRoot = resolve(repositoryRoot, "src/generated/resources/data/create/recipe/milling");
const outputRoot = resolve(bedrockRoot, "behavior_pack/scripts/processing/generated");
const TAG_ITEMS = await processingTagProjections(bedrockRoot);

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
	const inputs = source.ingredients?.length === 1 ? expandProcessingIngredient(source.ingredients[0], TAG_ITEMS) : [];
	const output = source.results?.every(result => typeof result.id === "string");
	if (sourcePath.startsWith("compat/")) {
		records.push({ source: sourcePath, status: "unsupported_dependency", reason: "compatibility_recipe" });
		continue;
	}
	if (source.type !== "create:milling" || inputs.length === 0 || !output) {
		records.push({ source: sourcePath, status: "manual_specification", reason: "unsupported_recipe_shape" });
		continue;
	}

	const outputs = source.results.map(result => ({
		typeId: mapJavaProcessingIdentifier(result.id),
		count: result.count ?? 1,
		chance: result.chance ?? 1
	}));
	if (!supportsProcessingRecipeItems([...inputs.map(input => input.typeId), ...outputs.map(result => result.typeId)])) {
		records.push({ source: sourcePath, status: "unsupported_dependency", reason: "unavailable_item" });
		continue;
	}
	const recipeIds = inputs.map((input, index) => {
		const recipe = { id: `create:milling/${sourcePath}:${index}`, input, processingTicks: source.processing_time ?? 100, outputs };
		recipes.push(recipe);
		return recipe.id;
	});
	records.push({ source: sourcePath, status: "migrated", recipeId: recipeIds[0], recipeIds });
}

recipes.sort((left, right) => left.id.localeCompare(right.id));
await mkdir(outputRoot, { recursive: true });
await mkdir(resolve(bedrockRoot, "data", "recipes"), { recursive: true });
await writeFile(resolve(outputRoot, "milling-recipes.js"), `// Generated from src/generated/resources/data/create/recipe/milling.\nexport const MILLING_RECIPES = ${JSON.stringify(recipes, null, "\t")};\n`);
await writeFile(resolve(bedrockRoot, "data", "recipes", "milling.json"), `${JSON.stringify(recipes, null, "\t")}\n`);
const report = processingImportReport("milling", records);
await writeFile(resolve(bedrockRoot, "data", "recipes", "milling-import-report.json"), `${JSON.stringify(report, null, "\t")}\n`);
console.log(`Milling recipes: ${report.summary.migrated} migrated, ${report.summary.unsupported_dependency} blocked by dependencies, ${report.summary.manual_specification} need manual specifications.`);
