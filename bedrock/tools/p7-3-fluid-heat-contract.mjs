import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");
const defaultRepositoryRoot = resolve(defaultBedrockRoot, "..");

async function json(file) {
	return JSON.parse(await readFile(file, "utf8"));
}

async function jsonFiles(directory) {
	const output = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const file = resolve(directory, entry.name);
		if (entry.isDirectory())
			output.push(...await jsonFiles(file));
		else if (entry.name.endsWith(".json"))
			output.push(file);
	}
	return output.sort((left, right) => left.localeCompare(right));
}

function mapIdentifier(id) {
	return id.startsWith("create:") ? `createbedrock:${id.slice("create:".length)}` : id;
}

function sourceShape(source) {
	const fluidIngredients = [];
	const ingredients = [];
	for (const ingredient of source.ingredients ?? []) {
		if (typeof ingredient.fluid === "string")
			fluidIngredients.push({ amount: ingredient.amount, typeId: mapIdentifier(ingredient.fluid) });
		else if (ingredient.type === "neoforge:tag")
			fluidIngredients.push({ amount: ingredient.amount, tag: ingredient.tag });
		else if (ingredient.item)
			ingredients.push({ count: ingredient.count ?? 1, typeId: mapIdentifier(ingredient.item) });
		else if (ingredient.tag)
			ingredients.push({ count: ingredient.count ?? 1, tag: ingredient.tag });
		else
			throw new Error("P7.3 encountered an unsupported core Basin ingredient");
	}
	const fluidOutputs = [];
	const outputs = [];
	for (const result of source.results ?? []) {
		if (result.amount !== undefined)
			fluidOutputs.push({ amount: result.amount, typeId: mapIdentifier(result.id) });
		else
			outputs.push({ chance: result.chance ?? 1, count: result.count ?? 1, typeId: mapIdentifier(result.id) });
	}
	return { fluidIngredients, fluidOutputs, heatRequirement: source.heat_requirement ?? "none", ingredients, outputs };
}

function comparable(recipe) {
	return JSON.stringify({
		fluidIngredients: recipe.fluidIngredients,
		fluidOutputs: recipe.fluidOutputs,
		heatRequirement: recipe.heatRequirement,
		ingredients: recipe.ingredients,
		outputs: recipe.outputs
	});
}

export async function validateP73FluidHeatContract({ bedrockRoot = defaultBedrockRoot, repositoryRoot = defaultRepositoryRoot } = {}) {
	const recipeRoot = resolve(repositoryRoot, "src/generated/resources/data/create/recipe");
	const module = await import(pathToFileURL(resolve(bedrockRoot, "behavior_pack/scripts/processing/generated/basin-recipes.js")).href);
	const generated = new Map(module.BASIN_RECIPES.map(recipe => [recipe.source, recipe]));
	const sourceRecipes = [];
	for (const directory of ["compacting", "mixing"]) {
		for (const file of await jsonFiles(resolve(recipeRoot, directory))) {
			const relative = file.slice(resolve(recipeRoot, directory).length + 1).replace(/\.json$/, "").replace(/\\/g, "/");
			if (relative.startsWith("compat/"))
				continue;
			const source = await json(file);
			const sourcePath = `${directory}/${relative}`;
			if (source.type !== `create:${directory === "mixing" ? "mixing" : "compacting"}`)
				throw new Error(`P7.3 core Basin source ${sourcePath} has an unexpected type`);
			sourceRecipes.push({ sourcePath, shape: sourceShape(source) });
		}
	}
	if (generated.size !== sourceRecipes.length)
		throw new Error(`P7.3 generated ${generated.size} Basin recipes for ${sourceRecipes.length} core source recipes`);
	for (const source of sourceRecipes) {
		const recipe = generated.get(source.sourcePath);
		if (!recipe || comparable(recipe) !== comparable(source.shape))
			throw new Error(`P7.3 Basin recipe ${source.sourcePath} lost a fluid, heat, item, or output condition`);
	}

	const [honeyBlock, chocolateBlock, honeyBucket, chocolateBucket, terrain, items, tank, importer, runtime, processing] = await Promise.all([
		json(resolve(bedrockRoot, "behavior_pack/blocks/honey.json")),
		json(resolve(bedrockRoot, "behavior_pack/blocks/chocolate.json")),
		json(resolve(bedrockRoot, "behavior_pack/items/honey_bucket.json")),
		json(resolve(bedrockRoot, "behavior_pack/items/chocolate_bucket.json")),
		json(resolve(bedrockRoot, "resource_pack/textures/terrain_texture.json")),
		json(resolve(bedrockRoot, "resource_pack/textures/item_texture.json")),
		json(resolve(bedrockRoot, "behavior_pack/blocks/fluid_tank.json")),
		readFile(resolve(bedrockRoot, "tools/import-java-assets.mjs"), "utf8"),
		readFile(resolve(bedrockRoot, "behavior_pack/scripts/fluids/fluid-runtime.js"), "utf8"),
		readFile(resolve(bedrockRoot, "behavior_pack/scripts/processing/stage3-processing-runtime.js"), "utf8")
	]);
	for (const [definition, id] of [[honeyBlock, "createbedrock:honey"], [chocolateBlock, "createbedrock:chocolate"], [honeyBucket, "createbedrock:honey_bucket"], [chocolateBucket, "createbedrock:chocolate_bucket"]])
		if (definition["minecraft:block"]?.description?.identifier !== id && definition["minecraft:item"]?.description?.identifier !== id)
			throw new Error(`P7.3 resource ${id} is not declared`);
	for (const key of ["createbedrock_fluid_honey", "createbedrock_fluid_chocolate", "createbedrock_fluid_tea"])
		if (!terrain.texture_data[key])
			throw new Error(`P7.3 terrain atlas is missing ${key}`);
	for (const key of ["createbedrock_honey_bucket", "createbedrock_chocolate_bucket"])
		if (!items.texture_data[key])
			throw new Error(`P7.3 item atlas is missing ${key}`);
	for (const kind of ["honey", "chocolate", "tea"])
		if (!tank["minecraft:block"].description.properties["createbedrock:fluid_kind"].includes(kind))
			throw new Error(`P7.3 tank visuals do not support ${kind}`);
	for (const marker of ["honey_bucket.png", "chocolate_bucket.png", "honey_still.png", "chocolate_still.png", "tea_still.png"])
		if (!importer.includes(marker))
			throw new Error(`P7.3 Java asset importer omits ${marker}`);
	for (const marker of ["fluidFromWorldSource", "worldSourceForFluid", "fluidPortForBlock", "heatForSteamTank"])
		if (!runtime.includes(marker))
			throw new Error(`P7.3 fluid runtime omits ${marker}`);
	for (const marker of ["BasinProcessingMachine", "blazeHeatAt", "fluidPortForBlock"])
		if (!processing.includes(marker))
			throw new Error(`P7.3 Basin runtime omits ${marker}`);
	return { basinRecipes: generated.size, customFluidBlocks: 2, customFluidBuckets: 2, visualKinds: 3 };
}
