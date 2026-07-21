import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

export const SEQUENCED_ASSEMBLY_IR_SCHEMA_VERSION = 1;

function mapIdentifier(identifier) {
	if (typeof identifier !== "string" || identifier.length === 0)
		throw new TypeError("Sequenced-assembly identifiers must be non-empty strings");
	return identifier.startsWith("create:")
		? `createbedrock:${identifier.slice("create:".length)}`
		: identifier;
}

function normalizeIngredient(ingredient) {
	if (Array.isArray(ingredient))
		return ingredient.map(normalizeIngredient);
	if (!ingredient || typeof ingredient !== "object")
		throw new TypeError("Sequenced-assembly ingredients must be objects or alternatives");
	if (typeof ingredient.item === "string")
		return { count: ingredient.count ?? 1, kind: "item", typeId: mapIdentifier(ingredient.item) };
	if (typeof ingredient.tag === "string")
		return { count: ingredient.count ?? 1, kind: "tag", tag: ingredient.tag };
	if (typeof ingredient.fluid === "string" && Number.isInteger(ingredient.amount) && ingredient.amount > 0)
		return { amount: ingredient.amount, kind: "fluid", typeId: mapIdentifier(ingredient.fluid) };
	throw new Error("Unsupported sequenced-assembly ingredient shape");
}

function normalizeResult(result) {
	if (!result || typeof result.id !== "string")
		throw new TypeError("Sequenced-assembly results require an identifier");
	const count = result.count ?? 1;
	const chance = result.chance ?? 1;
	if (!Number.isInteger(count) || count < 1 || !Number.isFinite(chance) || chance <= 0)
		throw new RangeError("Sequenced-assembly result counts and chances must be positive");
	return { chance, count, typeId: mapIdentifier(result.id) };
}

function normalizeStep(step) {
	if (!step || typeof step.type !== "string" || !Array.isArray(step.ingredients) || !Array.isArray(step.results))
		throw new TypeError("Sequenced-assembly steps require a type, ingredients, and results");
	return {
		ingredients: step.ingredients.map(normalizeIngredient),
		outputs: step.results.map(normalizeResult),
		type: step.type
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

function normalizeRecipe(source, sourcePath) {
	if (source?.type !== "create:sequenced_assembly" || !source.ingredient || !Array.isArray(source.results)
		|| !Array.isArray(source.sequence) || typeof source.transitional_item?.id !== "string")
		throw new Error(`Invalid Create sequenced-assembly recipe ${sourcePath}`);
	const loops = source.loops ?? 1;
	if (!Number.isInteger(loops) || loops < 1)
		throw new RangeError(`Sequenced-assembly recipe ${sourcePath} has an invalid loop count`);
	return {
		id: `create:sequenced_assembly/${sourcePath}`,
		input: normalizeIngredient(source.ingredient),
		loops,
		outputs: source.results.map(normalizeResult),
		source: sourcePath,
		steps: source.sequence.map(normalizeStep),
		transitionalItem: mapIdentifier(source.transitional_item.id)
	};
}

export async function buildSequencedAssemblyRecipes({ repositoryRoot }) {
	if (!repositoryRoot)
		throw new TypeError("Sequenced-assembly import requires a repository root");
	const sourceRoot = resolve(repositoryRoot, "src/generated/resources/data/create/recipe/sequenced_assembly");
	const recipes = [];
	for (const file of await filesUnder(sourceRoot)) {
		const sourcePath = relative(sourceRoot, file).replaceAll("\\", "/").replace(/\.json$/, "");
		const source = JSON.parse(await readFile(file, "utf8"));
		recipes.push(normalizeRecipe(source, sourcePath));
	}
	return {
		generatedAt: "deterministic",
		generatedFrom: "src/generated/resources/data/create/recipe/sequenced_assembly",
		recipes: recipes.sort((left, right) => left.id.localeCompare(right.id)),
		schemaVersion: SEQUENCED_ASSEMBLY_IR_SCHEMA_VERSION,
		summary: { recipes: recipes.length, steps: recipes.reduce((total, recipe) => total + recipe.steps.length, 0) }
	};
}

export function renderSequencedAssemblyRecipes(recipes) {
	if (!Array.isArray(recipes))
		throw new TypeError("Sequenced-assembly JavaScript rendering requires a recipe array");
	return `// Generated from Create sequenced-assembly recipe sources.\nexport const SEQUENCED_ASSEMBLY_RECIPES = ${JSON.stringify(recipes, null, "\t")};\n`;
}

export function validateSequencedAssemblyRecipes(document) {
	if (!document || typeof document !== "object" || Array.isArray(document))
		throw new TypeError("Sequenced-assembly IR must be an object");
	if (document.schemaVersion !== SEQUENCED_ASSEMBLY_IR_SCHEMA_VERSION || document.generatedAt !== "deterministic"
		|| document.generatedFrom !== "src/generated/resources/data/create/recipe/sequenced_assembly" || !Array.isArray(document.recipes))
		throw new Error("Sequenced-assembly IR has an invalid header");
	const ids = new Set();
	let steps = 0;
	const validIngredient = ingredient => {
		if (Array.isArray(ingredient))
			return ingredient.length > 0 && ingredient.every(validIngredient);
		if (!ingredient || typeof ingredient !== "object")
			return false;
		if (ingredient.kind === "item")
			return typeof ingredient.typeId === "string" && Number.isInteger(ingredient.count) && ingredient.count > 0;
		if (ingredient.kind === "tag")
			return typeof ingredient.tag === "string" && Number.isInteger(ingredient.count) && ingredient.count > 0;
		return ingredient.kind === "fluid" && typeof ingredient.typeId === "string" && Number.isInteger(ingredient.amount) && ingredient.amount > 0;
	};
	const validOutput = output => typeof output?.typeId === "string" && Number.isInteger(output.count) && output.count > 0
		&& Number.isFinite(output.chance) && output.chance > 0;
	for (const recipe of document.recipes) {
		if (typeof recipe?.id !== "string" || !recipe.id.startsWith("create:sequenced_assembly/") || ids.has(recipe.id)
			|| typeof recipe.source !== "string" || !recipe.input || !Number.isInteger(recipe.loops) || recipe.loops < 1
			|| typeof recipe.transitionalItem !== "string" || !recipe.transitionalItem.includes(":")
			|| !Array.isArray(recipe.outputs) || recipe.outputs.length === 0 || !Array.isArray(recipe.steps) || recipe.steps.length === 0)
			throw new Error("Sequenced-assembly IR has an invalid recipe");
		ids.add(recipe.id);
		if (!validIngredient(recipe.input))
			throw new Error(`Sequenced-assembly IR ${recipe.id} has an invalid input`);
		for (const output of recipe.outputs)
			if (!validOutput(output))
				throw new Error(`Sequenced-assembly IR ${recipe.id} has an invalid output`);
		for (const step of recipe.steps) {
			if (typeof step?.type !== "string" || !Array.isArray(step.ingredients) || step.ingredients.length === 0 || !step.ingredients.every(validIngredient)
				|| !Array.isArray(step.outputs) || step.outputs.length === 0 || !step.outputs.every(validOutput))
				throw new Error(`Sequenced-assembly IR ${recipe.id} has an invalid step`);
			steps++;
		}
	}
	if (document.summary?.recipes !== document.recipes.length || document.summary?.steps !== steps)
		throw new Error("Sequenced-assembly IR summary does not match recipes");
	return { recipes: document.recipes.length, steps };
}
