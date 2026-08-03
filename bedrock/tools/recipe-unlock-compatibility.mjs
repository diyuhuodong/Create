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
const NON_STACKABLE_RESULTS = new Set(["createbedrock:schedule"]);
const RECIPE_DISAMBIGUATORS = new Map([
	["createbedrock:brass_table_cloth", "minecraft:string"],
	["createbedrock:copper_table_cloth", "minecraft:string"],
	["createbedrock:content_observer", "minecraft:observer"],
	["createbedrock:copycat_step", "minecraft:stone"],
	["createbedrock:crushing_wheel_controller", "minecraft:piston"],
	["createbedrock:p7_2/crafting/kinetics/clutch", "minecraft:iron_ingot"],
	["createbedrock:display_link", "minecraft:comparator"],
	["createbedrock:lectern_controller", "minecraft:lectern"],
	["createbedrock:nixie_tube", "minecraft:redstone_lamp"],
	["createbedrock:powered_latch", "minecraft:repeater"],
	["createbedrock:powered_toggle_latch", "minecraft:tripwire_hook"],
	["createbedrock:pulse_repeater", "minecraft:comparator"],
	["createbedrock:pulse_timer", "minecraft:clock"],
	["createbedrock:redstone_contact", "minecraft:iron_pressure_plate"],
	["createbedrock:redstone_link", "minecraft:ender_pearl"],
	["createbedrock:redstone_requester", "minecraft:hopper"],
	["createbedrock:rotation_speed_controller", "minecraft:clock"],
	["createbedrock:stock_link", "minecraft:compass"]
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
		const discriminator = RECIPE_DISAMBIGUATORS.get(recipe?.description?.identifier);
		if (discriminator && Array.isArray(recipe.ingredients) && !recipe.ingredients.some(ingredient => ingredient?.item === discriminator)) {
			recipe.ingredients.push({ item: discriminator });
			changed = true;
		}
		if (NON_STACKABLE_RESULTS.has(recipe?.result?.item) && recipe.result.count > 1) {
			recipe.result.count = 1;
			changed = true;
		}
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
