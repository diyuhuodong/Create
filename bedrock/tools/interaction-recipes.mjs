import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

export const INTERACTION_RECIPE_IR_SCHEMA_VERSION = 1;

const INTERACTION_TYPES = new Set([
	"create:deploying",
	"create:emptying",
	"create:filling",
	"create:item_application",
	"create:item_copying",
	"create:sandpaper_polishing",
	"create:toolbox_dyeing"
]);

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function mapIdentifier(identifier) {
	if (typeof identifier !== "string" || identifier.length === 0)
		throw new TypeError("Interaction recipe identifiers must be non-empty strings");
	return identifier.startsWith("create:") ? `createbedrock:${identifier.slice("create:".length)}` : identifier;
}

function normalizeIngredient(ingredient) {
	if (Array.isArray(ingredient))
		return ingredient.map(normalizeIngredient);
	if (!ingredient || typeof ingredient !== "object")
		throw new TypeError("Interaction recipe ingredients must be objects or alternatives");
	const count = ingredient.count ?? 1;
	if (typeof ingredient.item === "string")
		return { count, kind: "item", sourceId: ingredient.item, typeId: mapIdentifier(ingredient.item) };
	if (typeof ingredient.tag === "string")
		return { count, kind: "tag", tag: ingredient.tag };
	if (typeof ingredient.fluids === "string" && Number.isInteger(ingredient.amount) && ingredient.amount > 0)
		return {
			amount: ingredient.amount,
			components: clone(ingredient.components ?? {}),
			kind: "component_fluid",
			sourceId: ingredient.fluids,
			typeId: mapIdentifier(ingredient.fluids)
		};
	if (typeof ingredient.fluid === "string" && Number.isInteger(ingredient.amount) && ingredient.amount > 0)
		return { amount: ingredient.amount, kind: "fluid", sourceId: ingredient.fluid, typeId: mapIdentifier(ingredient.fluid) };
	throw new Error("Unsupported interaction recipe ingredient shape");
}

function normalizeResults(results) {
	if (!Array.isArray(results) || results.length === 0)
		throw new TypeError("Interaction recipes require results");
	return results.map(result => {
		if (!result || typeof result.id !== "string")
			throw new TypeError("Interaction recipe results require identifiers");
		const chance = result.chance ?? 1;
		if (!Number.isFinite(chance) || chance <= 0)
			throw new RangeError("Interaction recipe result chances must be positive");
		if (result.amount !== undefined) {
			if (!Number.isInteger(result.amount) || result.amount < 1)
				throw new RangeError("Interaction recipe fluid results require positive amounts");
			return { amount: result.amount, chance, kind: "fluid", sourceId: result.id, typeId: mapIdentifier(result.id) };
		}
		const count = result.count ?? 1;
		if (!Number.isInteger(count) || count < 1)
			throw new RangeError("Interaction recipe item results require positive counts");
		return { chance, count, kind: "item", sourceId: result.id, typeId: mapIdentifier(result.id) };
	});
}

function normalizeRecipe(source, sourcePath) {
	if (!INTERACTION_TYPES.has(source?.type))
		throw new Error(`Unsupported interaction recipe type in ${sourcePath}`);
	const ingredients = Array.isArray(source.ingredients) ? source.ingredients.map(normalizeIngredient) : [];
	const results = source.results === undefined ? [] : normalizeResults(source.results);
	const specialInteraction = ["create:item_copying", "create:toolbox_dyeing"].includes(source.type);
	if (!specialInteraction && (ingredients.length === 0 || results.length === 0))
		throw new Error(`Interaction recipe ${sourcePath} is missing ingredients or results`);
	return {
		id: `create:${sourcePath}`,
		ingredients,
		keepHeldItem: source.keep_held_item === true,
		results,
		source: {
			id: `create:${sourcePath}`,
			path: `src/generated/resources/data/create/recipe/${sourcePath}.json`,
			type: source.type
		},
		sourceRecipe: clone(source),
		strategy: specialInteraction ? "special_runtime" : "port_runtime"
	};
}

async function filesUnder(directory) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const file = resolve(directory, entry.name);
		if (entry.isDirectory())
			files.push(...await filesUnder(file));
		else if (entry.name.endsWith(".json"))
			files.push(file);
	}
	return files.sort((left, right) => left.localeCompare(right));
}

function hasExternalCondition(source) {
	return Array.isArray(source["neoforge:conditions"])
		&& source["neoforge:conditions"].some(condition => condition?.type === "neoforge:mod_loaded" && typeof condition.modid === "string" && condition.modid !== "create");
}

export async function buildInteractionRecipes({ repositoryRoot }) {
	if (!repositoryRoot)
		throw new TypeError("Interaction recipe conversion requires a repository root");
	const sourceRoot = resolve(repositoryRoot, "src/generated/resources/data/create/recipe");
	const recipes = [];
	const records = [];
	for (const file of await filesUnder(sourceRoot)) {
		const source = JSON.parse(await readFile(file, "utf8"));
		if (!INTERACTION_TYPES.has(source.type))
			continue;
		const sourcePath = relative(sourceRoot, file).replaceAll("\\", "/").replace(/\.json$/, "");
		if (hasExternalCondition(source) || sourcePath.includes("/compat/")) {
			records.push({ reason: "external_compatibility", source: sourcePath, status: "external_compat" });
			continue;
		}
		try {
			const recipe = normalizeRecipe(source, sourcePath);
			recipes.push(recipe);
			records.push({ recipeId: recipe.id, source: sourcePath, status: "compiled" });
		} catch (error) {
			records.push({ reason: error.message, source: sourcePath, status: "manual_specification" });
		}
	}
	recipes.sort((left, right) => left.id.localeCompare(right.id));
	records.sort((left, right) => left.source.localeCompare(right.source));
	const status = Object.fromEntries(["compiled", "external_compat", "manual_specification"].map(name => [name, records.filter(record => record.status === name).length]));
	return {
		generatedAt: "deterministic",
		generatedFrom: "src/generated/resources/data/create/recipe",
		recipes,
		records,
		schemaVersion: INTERACTION_RECIPE_IR_SCHEMA_VERSION,
		summary: { recipes: records.length, status }
	};
}

export function renderInteractionRecipes(recipes) {
	if (!Array.isArray(recipes))
		throw new TypeError("Interaction recipe rendering requires an array");
	return `// Generated from Create interactive recipe sources.\nexport const INTERACTION_RECIPES = ${JSON.stringify(recipes, null, "\t")};\n`;
}

export function validateInteractionRecipes(document) {
	if (!document || typeof document !== "object" || Array.isArray(document) || document.schemaVersion !== INTERACTION_RECIPE_IR_SCHEMA_VERSION
		|| document.generatedAt !== "deterministic" || document.generatedFrom !== "src/generated/resources/data/create/recipe"
		|| !Array.isArray(document.recipes) || !Array.isArray(document.records))
		throw new TypeError("Interaction recipe IR has an invalid header");
	const ids = new Set();
	for (const recipe of document.recipes) {
		if (typeof recipe?.id !== "string" || ids.has(recipe.id) || !INTERACTION_TYPES.has(recipe.source?.type)
			|| typeof recipe.source?.id !== "string" || typeof recipe.source?.path !== "string"
			|| !Array.isArray(recipe.ingredients) || !Array.isArray(recipe.results) || !["port_runtime", "special_runtime"].includes(recipe.strategy))
			throw new Error("Interaction recipe IR contains an invalid recipe");
		ids.add(recipe.id);
	}
	if (document.summary?.recipes !== document.records.length)
		throw new Error("Interaction recipe IR summary is stale");
	for (const status of ["compiled", "external_compat", "manual_specification"])
		if (document.summary.status?.[status] !== document.records.filter(record => record.status === status).length)
			throw new Error(`Interaction recipe IR ${status} summary is stale`);
	return { recipes: document.recipes.length, records: document.records.length, status: { ...document.summary.status } };
}
