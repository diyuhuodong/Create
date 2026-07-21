import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
	mapJavaProcessingIdentifier,
	optionalMissingModDependency,
	processingImportReport,
	supportsProcessingRecipeItems
} from "./processing-recipe-import.js";
import { expandProcessingIngredient, processingTagProjections } from "./processing-tag-projections.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(bedrockRoot, "..");
const recipeRoot = resolve(repositoryRoot, "src/generated/resources/data/create/recipe");
const outputRoot = resolve(bedrockRoot, "behavior_pack/scripts/processing/generated");

const TAG_ITEMS = await processingTagProjections(bedrockRoot);

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
		]
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
	const alternatives = expandProcessingIngredient(ingredient, TAG_ITEMS);
	return alternatives.length > 0 ? alternatives : undefined;
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

function mapFluidIdentifier(identifier) {
	return mapJavaProcessingIdentifier(identifier);
}

function basinRecipe(source, sourceDefinition, sourcePath) {
	const ingredients = [];
	const fluidIngredients = [];
	for (const ingredient of source.ingredients ?? []) {
		const count = ingredient.count ?? 1;
		if (typeof ingredient?.fluid === "string") {
			fluidIngredients.push({ amount: ingredient.amount, typeId: mapFluidIdentifier(ingredient.fluid) });
			continue;
		}
		if (ingredient?.type === "neoforge:tag" && typeof ingredient.tag === "string") {
			fluidIngredients.push({ amount: ingredient.amount, tag: ingredient.tag });
			continue;
		}
		if (typeof ingredient?.item === "string") {
			ingredients.push({ count, typeId: mapJavaProcessingIdentifier(ingredient.item) });
			continue;
		}
		if (typeof ingredient?.tag === "string") {
			ingredients.push({ count, tag: ingredient.tag });
			continue;
		}
		return undefined;
	}
	const outputs = [];
	const fluidOutputs = [];
	for (const result of source.results ?? []) {
		if (typeof result?.id !== "string")
			return undefined;
		if (result.amount !== undefined) {
			fluidOutputs.push({ amount: result.amount, typeId: mapFluidIdentifier(result.id) });
			continue;
		}
		outputs.push({
			chance: result.chance ?? 1,
			count: result.count ?? 1,
			typeId: mapJavaProcessingIdentifier(result.id)
		});
	}
	if ((ingredients.length === 0 && fluidIngredients.length === 0) || (outputs.length === 0 && fluidOutputs.length === 0))
		return undefined;
	return {
		fluidIngredients,
		fluidOutputs,
		heatRequirement: source.heat_requirement ?? "none",
		id: `create:basin/${sourcePath}:0`,
		ingredients,
		mode: sourceDefinition.mode,
		outputs,
		processingTicks: source.processing_time ?? 100,
		source: sourcePath
	};
}

function generatedConstant(name) {
	return `${name.toUpperCase()}_RECIPES`;
}

async function nativeFanCookingRecipes() {
	const document = JSON.parse(await readFile(resolve(bedrockRoot, "data", "recipes", "recipe-ir.json"), "utf8"));
	const recipes = [];
	const records = [];
	const sources = document.recipes
		.filter(recipe => recipe.strategy === "vanilla_recipe" && ["minecraft:blasting", "minecraft:smelting", "minecraft:smoking"].includes(recipe.source?.type))
		.sort((left, right) => left.id.localeCompare(right.id));
	for (const source of sources) {
		const sourceRecipe = source.sourceRecipe;
		const alternatives = ingredientAlternatives(sourceRecipe.ingredient);
		const outputs = outputStacks([sourceRecipe.result]);
		const mode = source.source.type === "minecraft:smoking" ? "smoking" : "blasting";
		if (!alternatives || !outputs || !supportsProcessingRecipeItems([...alternatives.map(ingredient => ingredient.typeId), ...outputs.map(output => output.typeId)])) {
			records.push({ reason: "unavailable_item", source: source.id, status: "unsupported_dependency" });
			continue;
		}
		const recipeIds = alternatives.map((input, index) => {
			const priority = source.source.type === "minecraft:smelting" ? "0" : source.source.type === "minecraft:blasting" ? "1" : "2";
			const recipe = {
				id: `create:fan/${priority}_native/${source.id.slice("create:" )}:${index}`,
				ingredients: [input],
				mode,
				outputs,
				processingTicks: sourceRecipe.cookingtime ?? 100
			};
			recipes.push(recipe);
			return recipe.id;
		});
		records.push({ recipeId: recipeIds[0], recipeIds, source: source.id, status: "migrated" });
	}
	return { recipes, records };
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
			const optionalMod = optionalMissingModDependency(source);
			if (optionalMod) {
				records.push({ reason: `optional_missing_mod:${optionalMod}`, source: sourcePath, status: "unsupported_dependency" });
				continue;
			}
			if (processor.name === "basin") {
				const recipe = source.type === sourceDefinition.type && basinRecipe(source, sourceDefinition, sourcePath);
				if (!recipe) {
					records.push({ reason: "unsupported_recipe_shape", source: sourcePath, status: "manual_specification" });
					continue;
				}
				recipes.push(recipe);
				records.push({ recipeId: recipe.id, recipeIds: [recipe.id], source: sourcePath, status: "migrated" });
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
	if (processor.name === "fan") {
		const nativeCooking = await nativeFanCookingRecipes();
		recipes.push(...nativeCooking.recipes);
		records.push(...nativeCooking.records);
	}
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
