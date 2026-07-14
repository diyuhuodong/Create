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
const recipeRoot = resolve(repositoryRoot, "src/generated/resources/data/create/recipe");
const outputRoot = resolve(bedrockRoot, "behavior_pack/scripts/processing/generated");

const TAG_ITEMS = {
	"c:cobblestones": ["minecraft:cobblestone"],
	"c:flours/wheat": ["createbedrock:wheat_flour"],
	"c:ingots/copper": ["minecraft:copper_ingot"],
	"c:ingots/iron": ["minecraft:iron_ingot"],
	"c:ingots/zinc": ["createbedrock:zinc_ingot"],
	"c:nuggets/iron": ["minecraft:iron_nugget"]
};

const PROCESSORS = [
	{
		name: "basin",
		sources: [
			{ directory: "mixing", mode: "mixing", type: "create:mixing" },
			{ directory: "compacting", mode: "compacting", type: "create:compacting" }
		]
	},
	{
		name: "cutting",
		sources: [{ directory: "cutting", mode: "cutting", type: "create:cutting" }]
	},
	{
		name: "fan",
		sources: [
			{ directory: "haunting", mode: "haunting", type: "create:haunting" },
			{ directory: "splashing", mode: "splashing", type: "create:splashing" }
		],
		unavailableSources: ["minecraft:blasting recipe registry", "minecraft:smoking recipe registry"]
	}
];

async function findJsonFiles(directory) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const file = resolve(directory, entry.name);
		if (entry.isDirectory())
			files.push(...await findJsonFiles(file));
		else if (entry.name.endsWith(".json"))
			files.push(file);
	}
	return files.sort((left, right) => left.localeCompare(right));
}

function ingredientAlternatives(ingredient) {
	const count = ingredient?.count ?? 1;
	if (!Number.isInteger(count) || count < 1)
		return undefined;
	if (typeof ingredient?.item === "string")
		return [{ count, typeId: mapJavaProcessingIdentifier(ingredient.item) }];
	if (typeof ingredient?.tag === "string")
		return TAG_ITEMS[ingredient.tag]?.map(typeId => ({ count, typeId }));
	return undefined;
}

function ingredientCombinations(ingredients) {
	let combinations = [[]];
	for (const ingredient of ingredients) {
		const alternatives = ingredientAlternatives(ingredient);
		if (!alternatives || alternatives.length === 0)
			return undefined;
		combinations = combinations.flatMap(prefix => alternatives.map(alternative => [...prefix, alternative]));
		if (combinations.length > 32)
			return undefined;
	}
	return combinations;
}

function outputStacks(results) {
	// Create uses `amount` for fluid outputs. S3-11 owns managed item ports,
	// not fluid storage, so those recipes must stay visible in the report rather
	// than treating a fluid identifier as an ItemStack.
	if (!Array.isArray(results) || results.length === 0 || results.some(result => typeof result?.id !== "string" || result.amount !== undefined))
		return undefined;
	return results.map(result => ({
		chance: result.chance ?? 1,
		count: result.count ?? 1,
		typeId: mapJavaProcessingIdentifier(result.id)
	}));
}

function generatedConstant(name) {
	return `${name.toUpperCase()}_RECIPES`;
}

async function convertProcessor(processor) {
	const recipes = [];
	const records = [];
	for (const sourceDefinition of processor.sources) {
		const sourceRoot = resolve(recipeRoot, sourceDefinition.directory);
		for (const file of await findJsonFiles(sourceRoot)) {
			const source = JSON.parse(await readFile(file, "utf8"));
			const sourcePath = `${sourceDefinition.directory}/${relative(sourceRoot, file).replace(/\\/g, "/").replace(/\.json$/, "")}`;
			if (sourcePath.includes("/compat/")) {
				records.push({ reason: "compatibility_recipe", source: sourcePath, status: "unsupported_dependency" });
				continue;
			}
			const combinations = ingredientCombinations(source.ingredients);
			const outputs = outputStacks(source.results);
			if (source.type !== sourceDefinition.type || !combinations || !outputs) {
				records.push({ reason: "unsupported_recipe_shape", source: sourcePath, status: "manual_specification" });
				continue;
			}
			if (!combinations.every(ingredients => supportsProcessingRecipeItems([...ingredients.map(ingredient => ingredient.typeId), ...outputs.map(output => output.typeId)]))) {
				records.push({ reason: "unavailable_item", source: sourcePath, status: "unsupported_dependency" });
				continue;
			}
			const recipeIds = combinations.map((ingredients, index) => {
				const recipe = {
					id: `create:${processor.name}/${sourcePath}:${index}`,
					ingredients,
					mode: sourceDefinition.mode,
					outputs,
					processingTicks: source.processing_time ?? 100
				};
				recipes.push(recipe);
				return recipe.id;
			});
			records.push({ recipeId: recipeIds[0], recipeIds, source: sourcePath, status: "migrated" });
		}
	}
	for (const source of processor.unavailableSources ?? [])
		records.push({ reason: "runtime_recipe_registry_not_exported", source, status: "manual_specification" });
	recipes.sort((left, right) => left.id.localeCompare(right.id));
	const report = processingImportReport(processor.name, records);
	await writeFile(resolve(outputRoot, `${processor.name}-recipes.js`), `// Generated from Create ${processor.name} recipe sources.\nexport const ${generatedConstant(processor.name)} = ${JSON.stringify(recipes, null, "\t")};\n`);
	await writeFile(resolve(bedrockRoot, "data", "recipes", `${processor.name}.json`), `${JSON.stringify(recipes, null, "\t")}\n`);
	await writeFile(resolve(bedrockRoot, "data", "recipes", `${processor.name}-import-report.json`), `${JSON.stringify(report, null, "\t")}\n`);
	console.log(`${processor.name} recipes: ${report.summary.migrated} migrated, ${report.summary.unsupported_dependency} blocked by dependencies, ${report.summary.manual_specification} need manual specifications.`);
}

await mkdir(outputRoot, { recursive: true });
await mkdir(resolve(bedrockRoot, "data", "recipes"), { recursive: true });
for (const processor of PROCESSORS)
	await convertProcessor(processor);
