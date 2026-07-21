import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { JAVA_ITEM_TEXTURES } from "./import-java-assets.mjs";
import { isSupportedProcessingItem } from "../behavior_pack/scripts/processing/processing-item-support.js";

const CORE_ITEMS = [
	"brass_sheet",
	"brass_nugget",
	"brass_hand",
	"crafter_slot_cover",
	"electron_tube",
	"propeller",
	"transmitter",
	"whisk"
];

const DIRECT_RECIPES = {
	brass_hand: {
		pattern: [" A ", "BBB", " B "],
		key: { A: "createbedrock:andesite_alloy", B: "createbedrock:brass_sheet" }
	},
	crafter_slot_cover: {
		pattern: ["AAA"],
		key: { A: "createbedrock:brass_nugget" }
	},
	electron_tube: {
		pattern: ["L", "N"],
		key: { L: "createbedrock:polished_rose_quartz", N: "createbedrock:iron_sheet" }
	},
	propeller: {
		pattern: [" S ", "SCS", " S "],
		key: { C: "createbedrock:andesite_alloy", S: "createbedrock:iron_sheet" }
	},
	transmitter: {
		pattern: [" N ", "LLL", " R "],
		key: { L: "createbedrock:copper_sheet", N: "minecraft:lightning_rod", R: "minecraft:redstone" }
	},
	whisk: {
		pattern: [" C ", "SCS", "SSS"],
		key: { C: "createbedrock:andesite_alloy", S: "createbedrock:iron_sheet" }
	}
};

async function readJson(file) {
	return JSON.parse(await readFile(file, "utf8"));
}

async function fileExists(file) {
	try {
		return (await stat(file)).isFile();
	} catch {
		return false;
	}
}

function languageEntries(contents) {
	return new Map(contents.split(/\r?\n/)
		.filter(line => line && !line.startsWith("#"))
		.map(line => {
			const separator = line.indexOf("=");
			return separator === -1 ? [line, ""] : [line.slice(0, separator), line.slice(separator + 1)];
		}));
}

function sameArray(actual, expected) {
	return Array.isArray(actual) && actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function assert(condition, message) {
	if (!condition)
		throw new Error(`P7.1A core-material chain: ${message}`);
}

export async function validateCoreMaterialChain({ bedrockRoot, dataRoot = bedrockRoot, built = false }) {
	if (!bedrockRoot)
		throw new TypeError("P7.1A core-material chain validation requires a Bedrock root");
	const behaviorRoot = resolve(bedrockRoot, "behavior_pack");
	const resourceRoot = resolve(bedrockRoot, "resource_pack");
	const itemAtlas = await readJson(resolve(resourceRoot, "textures", "item_texture.json"));
	const [english, chinese] = await Promise.all([
		readFile(resolve(resourceRoot, "texts", "en_US.lang"), "utf8").then(languageEntries),
		readFile(resolve(resourceRoot, "texts", "zh_CN.lang"), "utf8").then(languageEntries)
	]);

	for (const identifier of CORE_ITEMS) {
		const item = await readJson(resolve(behaviorRoot, "items", `${identifier}.json`));
		const expectedId = `createbedrock:${identifier}`;
		const iconKey = `createbedrock_${identifier}`;
		assert(item["minecraft:item"]?.description?.identifier === expectedId, `${identifier} item definition has the wrong identifier`);
		assert(item["minecraft:item"]?.components?.["minecraft:icon"] === iconKey, `${identifier} item definition has the wrong icon`);
		assert(item["minecraft:item"]?.components?.["minecraft:max_stack_size"] === 64, `${identifier} item definition must stack to 64`);
		assert(itemAtlas.texture_data?.[iconKey]?.textures === `textures/create_java/item/${identifier}`, `${identifier} atlas entry is missing or wrong`);
		assert(english.has(`item.${expectedId}.name`), `${identifier} English name is missing`);
		assert(chinese.has(`item.${expectedId}.name`), `${identifier} Chinese name is missing`);
		assert(JAVA_ITEM_TEXTURES.includes(`${identifier}.png`), `${identifier} is not staged from the Java item texture`);
		if (built)
			assert(await fileExists(resolve(resourceRoot, "textures", "create_java", "item", `${identifier}.png`)), `${identifier} Java texture was not staged in the build`);
	}

	for (const [identifier, expected] of Object.entries(DIRECT_RECIPES)) {
		const recipe = await readJson(resolve(behaviorRoot, "recipes", `${identifier}.json`));
		const shaped = recipe["minecraft:recipe_shaped"];
		assert(shaped?.description?.identifier === `createbedrock:${identifier}`, `${identifier} recipe identifier is wrong`);
		assert(sameArray(shaped?.tags, ["crafting_table"]), `${identifier} recipe must be a crafting-table recipe`);
		assert(sameArray(shaped?.pattern, expected.pattern), `${identifier} recipe pattern differs from Java`);
		for (const [symbol, item] of Object.entries(expected.key))
			assert(shaped?.key?.[symbol]?.item === item, `${identifier} recipe key ${symbol} differs from Java`);
		assert(shaped?.result?.item === `createbedrock:${identifier}`, `${identifier} recipe result is wrong`);
	}

	const nuggetRecipe = await readJson(resolve(behaviorRoot, "recipes", "brass_nugget_from_ingot.json"));
	const shapeless = nuggetRecipe["minecraft:recipe_shapeless"];
	assert(shapeless?.description?.identifier === "createbedrock:brass_nugget_from_ingot", "brass-nugget recipe identifier is wrong");
	assert(shapeless?.ingredients?.length === 1 && shapeless.ingredients[0]?.item === "createbedrock:brass_ingot", "brass-nugget recipe must consume one brass ingot");
	assert(shapeless?.result?.item === "createbedrock:brass_nugget" && shapeless.result?.count === 9, "brass-nugget recipe must return nine nuggets");

	const pressingRecipes = await readJson(resolve(dataRoot, "data", "recipes", "pressing.json"));
	assert(pressingRecipes.some(recipe => recipe.id === "create:pressing/brass_ingot:createbedrock:brass_ingot"
		&& recipe.input?.typeId === "createbedrock:brass_ingot"
		&& recipe.outputs?.length === 1
		&& recipe.outputs[0]?.typeId === "createbedrock:brass_sheet"), "brass-sheet mechanical-press recipe is missing");
	assert(isSupportedProcessingItem("createbedrock:brass_sheet"), "brass sheet is not accepted by processing runtimes");

	return { items: CORE_ITEMS.length, directRecipes: Object.keys(DIRECT_RECIPES).length + 1, pressingRecipes: 1 };
}
