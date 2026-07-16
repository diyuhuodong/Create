import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { JAVA_BLOCK_TEXTURES, JAVA_ITEM_TEXTURES } from "./import-java-assets.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(defaultBedrockRoot, "..");

const RESOURCE_ONLY_BLOCKS = [
	{
		identifier: "createbedrock:brass_block",
		texture: "createbedrock_brass_block",
		sourceTexture: "brass_block.png",
		survivalDependency: "Create mixing must produce brass ingots before the storage-block recipe can be enabled."
	},
	{
		identifier: "createbedrock:railway_casing",
		texture: "createbedrock_railway_casing",
		sourceTexture: "railway_casing.png",
		sideTexture: "createbedrock_railway_casing_side",
		sideSourceTexture: "railway_casing_side.png",
		survivalDependency: "Create item application must combine a brass casing and an obsidian sheet."
	},
	{
		identifier: "createbedrock:refined_radiance_casing",
		texture: "createbedrock_refined_radiance_casing",
		sourceTexture: "refined_radiance_casing.png",
		survivalDependency: "Legacy refined-radiance world transformation must be implemented before this casing receives an acquisition path."
	},
	{
		identifier: "createbedrock:shadow_steel_casing",
		texture: "createbedrock_shadow_steel_casing",
		sourceTexture: "shadow_steel_casing.png",
		survivalDependency: "Legacy shadow-steel world transformation must be implemented before this casing receives an acquisition path."
	},
	{
		identifier: "createbedrock:rose_quartz_tiles",
		texture: "createbedrock_rose_quartz_tiles",
		sourceTexture: "palettes/rose_quartz_tiles.png",
		survivalRecipe: "rose_quartz_tiles"
	},
	{
		identifier: "createbedrock:small_rose_quartz_tiles",
		texture: "createbedrock_small_rose_quartz_tiles",
		sourceTexture: "palettes/small_rose_quartz_tiles.png",
		survivalRecipe: "small_rose_quartz_tiles"
	}
];

const RESOURCE_ONLY_ITEM = {
	identifier: "createbedrock:cardboard",
	texture: "createbedrock_cardboard",
	sourceTexture: "cardboard.png",
	survivalDependency: "Mechanical pressing must produce cardboard from Create pulp before the item becomes survival-obtainable."
};

const FOOD_ITEMS = [
	{
		identifier: "createbedrock:bar_of_chocolate",
		texture: "createbedrock_bar_of_chocolate",
		sourceTexture: "bar_of_chocolate.png",
		nutrition: 6,
		saturationModifier: 0.3,
		useAnimation: "eat",
		useDuration: 1.6,
		survivalDependency: "Create compacting and chocolate-processing recipes must be implemented before this food becomes survival-obtainable."
	},
	{
		identifier: "createbedrock:sweet_roll",
		texture: "createbedrock_sweet_roll",
		sourceTexture: "sweet_roll.png",
		nutrition: 6,
		saturationModifier: 0.8,
		useAnimation: "eat",
		useDuration: 1.6,
		survivalDependency: "Create filling must produce sweet rolls before this food becomes survival-obtainable."
	},
	{
		identifier: "createbedrock:chocolate_glazed_berries",
		texture: "createbedrock_chocolate_glazed_berries",
		sourceTexture: "chocolate_glazed_berries.png",
		nutrition: 7,
		saturationModifier: 0.8,
		useAnimation: "eat",
		useDuration: 1.6,
		survivalDependency: "Create filling must produce chocolate-glazed berries before this food becomes survival-obtainable."
	},
	{
		identifier: "createbedrock:honeyed_apple",
		texture: "createbedrock_honeyed_apple",
		sourceTexture: "honeyed_apple.png",
		nutrition: 8,
		saturationModifier: 0.8,
		useAnimation: "eat",
		useDuration: 1.6,
		survivalDependency: "Create filling must produce honeyed apples before this food becomes survival-obtainable."
	},
	{
		identifier: "createbedrock:builders_tea",
		texture: "createbedrock_builders_tea",
		sourceTexture: "builders_tea.png",
		nutrition: 1,
		saturationModifier: 0.6,
		useAnimation: "drink",
		useDuration: 2.1,
		canAlwaysEat: true,
		effects: [{ name: "haste", chance: 1, duration: 180, amplifier: 0 }],
		usingConvertsTo: "minecraft:glass_bottle",
		survivalDependency: "Create filling must produce Builder's Tea before this drink becomes survival-obtainable."
	}
];

async function readJson(file) {
	try {
		return JSON.parse(await readFile(file, "utf8"));
	} catch (error) {
		throw new Error(`Invalid JSON in ${file}: ${error.message}`);
	}
}

async function fileExists(file) {
	try {
		return (await stat(file)).isFile();
	} catch {
		return false;
	}
}

function languageKeys(contents) {
	return new Set(contents.split(/\r?\n/)
		.map(line => line.indexOf("=") === -1 ? "" : line.slice(0, line.indexOf("=")))
		.filter(Boolean));
}

function blockFileName(identifier) {
	return identifier.slice("createbedrock:".length);
}

function itemFileName(identifier) {
	return identifier.slice("createbedrock:".length);
}

function assertMaterialInstances(materialInstances, entry) {
	if (entry.sideTexture) {
		if (materialInstances?.end?.texture !== entry.texture || materialInstances?.side?.texture !== entry.sideTexture)
			throw new Error(`C1 resource block ${entry.identifier} must retain its Java top/bottom and side texture split`);
		return;
	}
	if (materialInstances?.all?.texture !== entry.texture)
		throw new Error(`C1 resource block ${entry.identifier} must use its dedicated Java-derived texture`);
}

function assertJavaCube(definition, entry) {
	const block = definition["minecraft:block"];
	const components = block?.components ?? {};
	if (block?.description?.identifier !== entry.identifier || !block.description.menu_category?.category)
		throw new Error(`C1 resource block ${entry.identifier} must have an identifier and creative-menu entry`);
	const geometry = `geometry.createbedrock.${blockFileName(entry.identifier)}`;
	if (components["minecraft:geometry"] !== geometry
		|| components["minecraft:item_visual"]?.geometry?.identifier !== geometry)
		throw new Error(`C1 resource block ${entry.identifier} must retain its named Java cube geometry`);
	for (const materialInstances of [components["minecraft:material_instances"], components["minecraft:item_visual"]?.material_instances])
		assertMaterialInstances(materialInstances, entry);
	if (components["minecraft:loot"] !== `loot_tables/blocks/${blockFileName(entry.identifier)}.json`)
		throw new Error(`C1 resource block ${entry.identifier} must have an explicit self-drop loot table`);
}

/**
 * C1 resource work makes content visible and safely obtainable in creative
 * mode, without manufacturing an incorrect survival recipe while its real
 * Create-machine or legacy-world dependency remains unported.
 */
export async function validateContentMaterialResources({ bedrockRoot = defaultBedrockRoot, built = false } = {}) {
	const behaviorRoot = resolve(bedrockRoot, "behavior_pack");
	const resourceRoot = resolve(bedrockRoot, "resource_pack");
	const terrainAtlas = await readJson(resolve(resourceRoot, "textures", "terrain_texture.json"));
	const itemAtlas = await readJson(resolve(resourceRoot, "textures", "item_texture.json"));
	const languageSets = new Map(await Promise.all(["en_US", "zh_CN"].map(async locale => [
		locale,
		languageKeys(await readFile(resolve(resourceRoot, "texts", `${locale}.lang`), "utf8"))
	])));

	for (const entry of RESOURCE_ONLY_BLOCKS) {
		const name = blockFileName(entry.identifier);
		const [definition, loot] = await Promise.all([
			readJson(resolve(behaviorRoot, "blocks", `${name}.json`)),
			readJson(resolve(behaviorRoot, "loot_tables", "blocks", `${name}.json`))
		]);
		assertJavaCube(definition, entry);
		if (loot.pools?.[0]?.entries?.[0]?.name !== entry.identifier)
			throw new Error(`C1 resource block ${entry.identifier} must self-drop until its acquisition dependency is enabled`);
		const textureSources = [
			{ atlasKey: entry.texture, sourceTexture: entry.sourceTexture },
			...(entry.sideTexture ? [{ atlasKey: entry.sideTexture, sourceTexture: entry.sideSourceTexture }] : [])
		];
		for (const texture of textureSources) {
			if (terrainAtlas.texture_data?.[texture.atlasKey]?.textures !== `textures/create_java/block/${texture.sourceTexture.slice(0, -4)}`)
				throw new Error(`C1 resource block ${entry.identifier} is missing terrain-atlas mapping ${texture.atlasKey}`);
			if (!JAVA_BLOCK_TEXTURES.includes(texture.sourceTexture))
				throw new Error(`C1 resource block ${entry.identifier} is not staged by import-java-assets.mjs`);
		}
		for (const locale of ["en_US", "zh_CN"]) {
			if (!languageSets.get(locale).has(`tile.${entry.identifier}.name`))
				throw new Error(`C1 resource block ${entry.identifier} is missing ${locale} localization`);
		}
		if (entry.survivalRecipe) {
			const recipe = await readJson(resolve(behaviorRoot, "recipes", `${entry.survivalRecipe}.json`));
			const definition = recipe["minecraft:recipe_shapeless"];
			if (definition?.description?.identifier !== entry.identifier
				|| definition.tags?.[0] !== "stonecutter"
				|| definition.ingredients?.[0]?.item !== "createbedrock:polished_rose_quartz"
				|| definition.result?.item !== entry.identifier
				|| definition.result?.count !== 2)
				throw new Error(`C1 resource block ${entry.identifier} must retain its polished-rose-quartz stonecutter recipe`);
		}
		for (const texture of textureSources) {
			const textureFile = built
				? resolve(resourceRoot, "textures", "create_java", "block", texture.sourceTexture)
				: resolve(repositoryRoot, "src/main/resources/assets/create/textures/block", texture.sourceTexture);
			if (!await fileExists(textureFile))
				throw new Error(`C1 resource block ${entry.identifier} is missing Java-derived texture ${textureFile}`);
		}
	}

	const item = await readJson(resolve(behaviorRoot, "items", "cardboard.json"));
	const components = item["minecraft:item"]?.components ?? {};
	if (item["minecraft:item"]?.description?.identifier !== RESOURCE_ONLY_ITEM.identifier
		|| !item["minecraft:item"]?.description?.menu_category?.category
		|| components["minecraft:icon"] !== RESOURCE_ONLY_ITEM.texture
		|| components["minecraft:max_stack_size"] !== 64
		|| components["minecraft:fuel"]?.duration !== 50)
		throw new Error("C1 cardboard must retain its creative entry, icon, stack size, and 50-second fuel duration");
	if (itemAtlas.texture_data?.[RESOURCE_ONLY_ITEM.texture]?.textures !== "textures/create_java/item/cardboard")
		throw new Error("C1 cardboard is missing its item-atlas mapping");
	if (!JAVA_ITEM_TEXTURES.includes(RESOURCE_ONLY_ITEM.sourceTexture))
		throw new Error("C1 cardboard is not staged by import-java-assets.mjs");
	for (const locale of ["en_US", "zh_CN"]) {
		if (!languageSets.get(locale).has(`item.${RESOURCE_ONLY_ITEM.identifier}.name`))
			throw new Error(`C1 cardboard is missing ${locale} localization`);
	}
	const itemTextureFile = built
		? resolve(resourceRoot, "textures", "create_java", "item", RESOURCE_ONLY_ITEM.sourceTexture)
		: resolve(repositoryRoot, "src/main/resources/assets/create/textures/item", RESOURCE_ONLY_ITEM.sourceTexture);
	if (!await fileExists(itemTextureFile))
		throw new Error(`C1 cardboard is missing Java-derived texture ${itemTextureFile}`);

	for (const entry of FOOD_ITEMS) {
		const itemName = itemFileName(entry.identifier);
		const definition = await readJson(resolve(behaviorRoot, "items", `${itemName}.json`));
		const itemDefinition = definition["minecraft:item"];
		const itemComponents = itemDefinition?.components ?? {};
		const food = itemComponents["minecraft:food"];
		const expectedStackSize = entry.identifier === "createbedrock:builders_tea" ? 16 : 64;
		if (itemDefinition?.description?.identifier !== entry.identifier
			|| !itemDefinition.description.menu_category?.category
			|| itemComponents["minecraft:icon"] !== entry.texture
			|| itemComponents["minecraft:max_stack_size"] !== expectedStackSize
			|| food?.nutrition !== entry.nutrition
			|| food.saturation_modifier !== entry.saturationModifier
			|| itemComponents["minecraft:use_animation"] !== entry.useAnimation
			|| itemComponents["minecraft:use_modifiers"]?.use_duration !== entry.useDuration)
			throw new Error(`C1 food ${entry.identifier} must retain its Java hunger, saturation, stack, and use behavior`);
		if (entry.canAlwaysEat && (food.can_always_eat !== true
			|| JSON.stringify(food.effects) !== JSON.stringify(entry.effects)
			|| food.using_converts_to !== entry.usingConvertsTo))
			throw new Error(`C1 food ${entry.identifier} must retain its drink effect and glass-bottle return`);
		if (itemAtlas.texture_data?.[entry.texture]?.textures !== `textures/create_java/item/${entry.sourceTexture.slice(0, -4)}`)
			throw new Error(`C1 food ${entry.identifier} is missing its item-atlas mapping`);
		if (!JAVA_ITEM_TEXTURES.includes(entry.sourceTexture))
			throw new Error(`C1 food ${entry.identifier} is not staged by import-java-assets.mjs`);
		for (const locale of ["en_US", "zh_CN"]) {
			if (!languageSets.get(locale).has(`item.${entry.identifier}.name`))
				throw new Error(`C1 food ${entry.identifier} is missing ${locale} localization`);
		}
		const textureFile = built
			? resolve(resourceRoot, "textures", "create_java", "item", entry.sourceTexture)
			: resolve(repositoryRoot, "src/main/resources/assets/create/textures/item", entry.sourceTexture);
		if (!await fileExists(textureFile))
			throw new Error(`C1 food ${entry.identifier} is missing Java-derived texture ${textureFile}`);
	}

	return {
		contentBlocks: RESOURCE_ONLY_BLOCKS.length,
		contentItems: 1 + FOOD_ITEMS.length,
		deferredSurvivalAcquisitions: [...RESOURCE_ONLY_BLOCKS, RESOURCE_ONLY_ITEM, ...FOOD_ITEMS].filter(entry => entry.survivalDependency).map(entry => ({
			identifier: entry.identifier,
			dependency: entry.survivalDependency
		}))
	};
}
