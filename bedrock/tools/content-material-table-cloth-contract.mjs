import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { JAVA_BLOCK_TEXTURES, JAVA_ITEM_TEXTURES } from "./import-java-assets.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(defaultBedrockRoot, "..");
const TABLE_CLOTHS = [
	{ name: "andesite_table_cloth", ingredient: "createbedrock:andesite_alloy", texture: "table_cloth/andesite.png" },
	{ name: "brass_table_cloth", ingredient: "createbedrock:brass_ingot", texture: "table_cloth/brass.png" },
	{ name: "copper_table_cloth", ingredient: "minecraft:copper_ingot", texture: "table_cloth/copper.png" }
];

async function json(path) { return JSON.parse(await readFile(path, "utf8")); }
async function exists(path) { try { return (await stat(path)).isFile(); } catch { return false; } }
function languageKeys(contents) { return new Set(contents.split(/\r?\n/).map(line => line.split("=", 1)[0]).filter(Boolean)); }

export async function validateTableClothMaterials({ bedrockRoot = defaultBedrockRoot, built = false } = {}) {
	const behaviorRoot = resolve(bedrockRoot, "behavior_pack");
	const resourceRoot = resolve(bedrockRoot, "resource_pack");
	const [terrain, items, runtime, logic, main, en, zh] = await Promise.all([
		json(resolve(resourceRoot, "textures", "terrain_texture.json")),
		json(resolve(resourceRoot, "textures", "item_texture.json")),
		readFile(resolve(behaviorRoot, "scripts", "materials", "table-cloth-runtime.js"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "materials", "table-cloth.js"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "main.js"), "utf8"),
		readFile(resolve(resourceRoot, "texts", "en_US.lang"), "utf8"),
		readFile(resolve(resourceRoot, "texts", "zh_CN.lang"), "utf8")
	]);
	if (!runtime.includes("requestDepotItem") || !runtime.includes("checkoutShoppingList") || !runtime.includes("registerMovingBlockDataContributor")
		|| !logic.includes("addShoppingListPurchase") || !logic.includes("shoppingListTotals") || !main.includes("registerTableCloths"))
		throw new Error("Table Cloth must retain shop configuration, Shopping List checkout, Depot requests, and contraption persistence");
	const languages = [languageKeys(en), languageKeys(zh)];
	for (const cloth of TABLE_CLOTHS) {
		const identifier = `createbedrock:${cloth.name}`;
		const [block, recipe, loot] = await Promise.all([
			json(resolve(behaviorRoot, "blocks", `${cloth.name}.json`)),
			json(resolve(behaviorRoot, "recipes", `${cloth.name}.json`)),
			json(resolve(behaviorRoot, "loot_tables", "blocks", `${cloth.name}.json`))
		]);
		const definition = block["minecraft:block"];
		if (definition?.description?.identifier !== identifier || !definition.description.menu_category?.category
			|| definition.components?.["minecraft:geometry"] !== `geometry.createbedrock.${cloth.name}`
			|| definition.components?.["minecraft:loot"] !== `loot_tables/blocks/${cloth.name}.json`
			|| definition.description.properties?.["createbedrock:shop"]?.join(",") !== "0,1"
			|| definition.description.properties?.["createbedrock:display_count"]?.join(",") !== "0,1,2,3,4")
			throw new Error(`${identifier} must retain its interactive shop block definition`);
		const shaping = recipe["minecraft:recipe_shapeless"];
		if (shaping?.description?.identifier !== identifier || shaping.ingredients?.[0]?.item !== cloth.ingredient
			|| shaping.result?.item !== identifier || shaping.result?.count !== 2 || loot.pools?.[0]?.entries?.[0]?.name !== identifier)
			throw new Error(`${identifier} must retain its two-cover acquisition and self-drop paths`);
		if (terrain.texture_data?.[`createbedrock_${cloth.name}`]?.textures !== `textures/create_java/block/${cloth.texture.slice(0, -4)}`
			|| !JAVA_BLOCK_TEXTURES.includes(cloth.texture))
			throw new Error(`${identifier} is missing its Java-derived Table Cloth texture`);
		for (const keys of languages)
			if (!keys.has(`tile.${identifier}.name`))
				throw new Error(`${identifier} is missing EN or ZH localization`);
		const texture = built
			? resolve(resourceRoot, "textures", "create_java", "block", cloth.texture)
			: resolve(repositoryRoot, "src/main/resources/assets/create/textures/block", cloth.texture);
		if (!await exists(texture))
			throw new Error(`${identifier} source or staged texture is missing`);
	}
	const list = await json(resolve(behaviorRoot, "items", "shopping_list.json"));
	if (list["minecraft:item"]?.description?.identifier !== "createbedrock:shopping_list"
		|| list["minecraft:item"].components?.["minecraft:max_stack_size"] !== 1
		|| list["minecraft:item"].components?.["minecraft:icon"] !== "createbedrock_shopping_list"
		|| items.texture_data?.createbedrock_shopping_list?.textures !== "textures/create_java/item/shopping_list"
		|| !JAVA_ITEM_TEXTURES.includes("shopping_list.png"))
		throw new Error("Shopping List must retain its unique stack and Java icon");
	for (const keys of languages)
		if (!keys.has("item.createbedrock:shopping_list.name"))
			throw new Error("Shopping List is missing EN or ZH localization");
	const listTexture = built
		? resolve(resourceRoot, "textures", "create_java", "item", "shopping_list.png")
		: resolve(repositoryRoot, "src/main/resources/assets/create/textures/item", "shopping_list.png");
	if (!await exists(listTexture))
		throw new Error("Shopping List source or staged icon is missing");
	return { blocks: TABLE_CLOTHS.length, items: 1, persistenceSchema: 1 };
}
