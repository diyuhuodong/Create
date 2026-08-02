import { readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const UNLOCKABLE_RECIPE_TYPES = new Set([
	"minecraft:recipe_furnace",
	"minecraft:recipe_shaped",
	"minecraft:recipe_shapeless",
	"minecraft:recipe_smithing_transform"
]);

const UNSUPPORTED_VANILLA_ITEMS = new Set([
	"minecraft:furnace_minecart",
	"minecraft:item_frame",
	"minecraft:oak_door"
]);

async function recipeFiles(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	const nested = await Promise.all(entries.map(entry => entry.isDirectory()
		? recipeFiles(resolve(directory, entry.name))
		: entry.name.endsWith(".json") ? [resolve(directory, entry.name)] : []));
	return nested.flat();
}

export function normalizeRecipeUnlocks(definition) {
	let changed = false;
	for (const [type, recipe] of Object.entries(definition)) {
		if (UNLOCKABLE_RECIPE_TYPES.has(type) && recipe?.unlock === undefined) {
			recipe.unlock = { context: "AlwaysUnlocked" };
			changed = true;
		}
	}
	return changed;
}

function normalizeRecipeDimensions(definition) {
	const recipe = definition["minecraft:recipe_shaped"];
	if (!Array.isArray(recipe?.pattern) || (recipe.pattern.length <= 3 && recipe.pattern.every(row => row.length <= 3)))
		return false;
	recipe.pattern = recipe.pattern.slice(0, 3).map(row => row.slice(0, 3));
	return true;
}

function containsUnsupportedIngredient(value) {
	if (!value || typeof value !== "object")
		return false;
	if (typeof value.tag === "string" || UNSUPPORTED_VANILLA_ITEMS.has(value.item))
		return true;
	return Object.values(value).some(containsUnsupportedIngredient);
}

export function omitUnsupportedRecipe(definition, { generated = false } = {}) {
	for (const [type, recipe] of Object.entries(definition)) {
		if (type === "format_version" || !recipe || typeof recipe !== "object")
			continue;
		if (generated && (type === "minecraft:recipe_smithing_transform" || containsUnsupportedIngredient(recipe)))
			return true;
	}
	return false;
}

export async function normalizeStagedRecipeUnlocks({ behaviorPackRoot }) {
	const files = await recipeFiles(resolve(behaviorPackRoot, "recipes"));
	let omitted = 0;
	let recipes = 0;
	for (const file of files) {
		const definition = JSON.parse(await readFile(file, "utf8"));
		if (omitUnsupportedRecipe(definition, { generated: file.includes("/recipes/generated/p7_2/") || file.includes("\\recipes\\generated\\p7_2\\") })) {
			await unlink(file);
			omitted++;
			continue;
		}
		const dimensions = normalizeRecipeDimensions(definition);
		const unlocks = normalizeRecipeUnlocks(definition);
		if (!dimensions && !unlocks)
			continue;
		await writeFile(file, `${JSON.stringify(definition, null, 2)}\n`);
		recipes++;
	}
	return { omitted, recipes };
}
