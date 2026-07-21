import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

export const MECHANICAL_CRAFTING_IR_SCHEMA_VERSION = 1;

function mapIdentifier(identifier) {
	if (typeof identifier !== "string" || identifier.length === 0)
		throw new TypeError("Mechanical-crafting identifiers must be non-empty strings");
	return identifier.startsWith("create:") ? `createbedrock:${identifier.slice("create:".length)}` : identifier;
}

function normalizeIngredient(ingredient) {
	if (!ingredient || typeof ingredient !== "object")
		throw new TypeError("Mechanical-crafting keys require ingredients");
	if (typeof ingredient.item === "string")
		return { item: mapIdentifier(ingredient.item) };
	if (typeof ingredient.tag === "string")
		return { tag: ingredient.tag };
	throw new Error("Unsupported mechanical-crafting ingredient shape");
}

function normalizeRecipe(source, sourcePath) {
	if (source?.type !== "create:mechanical_crafting" || !source.key || !Array.isArray(source.pattern) || !source.result)
		throw new Error(`Invalid mechanical-crafting recipe ${sourcePath}`);
	const key = Object.fromEntries(Object.entries(source.key).map(([symbol, ingredient]) => [symbol, normalizeIngredient(ingredient)]));
	const count = source.result.count ?? 1;
	if (!Number.isInteger(count) || count < 1 || typeof source.result.id !== "string")
		throw new TypeError(`Mechanical-crafting recipe ${sourcePath} has an invalid result`);
	return {
		acceptMirrored: source.accept_mirrored ?? true,
		id: `create:mechanical_crafting/${sourcePath}`,
		key,
		output: { count, typeId: mapIdentifier(source.result.id) },
		pattern: [...source.pattern],
		source: sourcePath
	};
}

export async function buildMechanicalCraftingRecipes({ repositoryRoot }) {
	if (!repositoryRoot)
		throw new TypeError("Mechanical-crafting import requires a repository root");
	const sourceRoot = resolve(repositoryRoot, "src/generated/resources/data/create/recipe/mechanical_crafting");
	const recipes = [];
	for (const entry of await readdir(sourceRoot, { withFileTypes: true })) {
		if (!entry.isFile() || !entry.name.endsWith(".json"))
			continue;
		const file = resolve(sourceRoot, entry.name);
		const sourcePath = relative(sourceRoot, file).replaceAll("\\", "/").replace(/\.json$/, "");
		recipes.push(normalizeRecipe(JSON.parse(await readFile(file, "utf8")), sourcePath));
	}
	recipes.sort((left, right) => left.id.localeCompare(right.id));
	return {
		generatedAt: "deterministic",
		generatedFrom: "src/generated/resources/data/create/recipe/mechanical_crafting",
		recipes,
		schemaVersion: MECHANICAL_CRAFTING_IR_SCHEMA_VERSION,
		summary: { recipes: recipes.length }
	};
}

export function renderMechanicalCraftingRecipes(recipes) {
	if (!Array.isArray(recipes))
		throw new TypeError("Mechanical-crafting recipe rendering requires an array");
	return `// Generated from Create mechanical-crafting recipe sources.\nexport const MECHANICAL_CRAFTING_RECIPES = ${JSON.stringify(recipes, null, "\t")};\n`;
}

export function validateMechanicalCraftingRecipes(document) {
	if (!document || typeof document !== "object" || document.schemaVersion !== MECHANICAL_CRAFTING_IR_SCHEMA_VERSION
		|| document.generatedAt !== "deterministic" || document.generatedFrom !== "src/generated/resources/data/create/recipe/mechanical_crafting"
		|| !Array.isArray(document.recipes))
		throw new TypeError("Mechanical-crafting IR has an invalid header");
	const ids = new Set();
	for (const recipe of document.recipes) {
		if (typeof recipe?.id !== "string" || ids.has(recipe.id) || typeof recipe.acceptMirrored !== "boolean"
			|| !recipe.key || !Array.isArray(recipe.pattern) || recipe.pattern.length === 0
			|| typeof recipe.output?.typeId !== "string" || !Number.isInteger(recipe.output.count) || recipe.output.count < 1)
			throw new Error("Mechanical-crafting IR contains an invalid recipe");
		ids.add(recipe.id);
	}
	if (document.summary?.recipes !== document.recipes.length)
		throw new Error("Mechanical-crafting IR summary is stale");
	return { recipes: document.recipes.length };
}
