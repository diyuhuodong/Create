import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const UNLOCKABLE_RECIPE_TYPES = new Set([
	"minecraft:recipe_furnace",
	"minecraft:recipe_shaped",
	"minecraft:recipe_shapeless",
	"minecraft:recipe_smithing_transform"
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

export async function normalizeStagedRecipeUnlocks({ behaviorPackRoot }) {
	const files = await recipeFiles(resolve(behaviorPackRoot, "recipes"));
	let recipes = 0;
	for (const file of files) {
		const definition = JSON.parse(await readFile(file, "utf8"));
		if (!normalizeRecipeUnlocks(definition))
			continue;
		await writeFile(file, `${JSON.stringify(definition, null, 2)}\n`);
		recipes++;
	}
	return { recipes };
}
