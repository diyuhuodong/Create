import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { JAVA_ARMOR_TEXTURES, JAVA_BLOCK_TEXTURES, JAVA_ITEM_TEXTURES } from "./import-java-assets.mjs";
import { JAVA_MODELS } from "./convert-java-models.mjs";

const bedrockRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(bedrockRoot, "..");
const TOOLBOX_COLORS = ["white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray", "light_gray", "cyan", "purple", "blue", "brown", "green", "red", "black"];
const EQUIPMENT_ITEMS = [
	"copper_backtank", "copper_backtank_placeable", "netherite_backtank", "netherite_backtank_placeable",
	"copper_diving_helmet", "copper_diving_boots", "netherite_diving_helmet", "netherite_diving_boots",
	"goggles", "extendo_grip", "potato_cannon", "wrench"
];

async function exists(path) { try { return (await stat(path)).isFile(); } catch { return false; } }

async function requireFile(root, relative) {
	if (!await exists(resolve(root, relative)))
		throw new Error(`Stage 6 is missing ${relative}`);
}

async function json(root, relative) {
	return JSON.parse(await readFile(resolve(root, relative), "utf8"));
}

export async function validateStage6StaticContract({ root = bedrockRoot, built = false, trackingRoot = bedrockRoot } = {}) {
	const matrix = await json(trackingRoot, "data/migration-matrix.json");
	const entries = matrix.entries.filter(entry => entry.phase === 6);
	if (entries.length !== 16 || entries.some(entry => entry.status !== "static_verified" || entry.behaviorPath !== "behavior_pack/scripts/equipment/equipment-runtime.js" || entry.persistenceSchema !== 1))
		throw new Error("Stage 6 requires exactly 16 static-verified equipment records with the shared persistence runtime");

	for (const relative of [
		"behavior_pack/scripts/equipment/equipment-state.js",
		"behavior_pack/scripts/equipment/toolbox-state.js",
		"behavior_pack/scripts/equipment/equipment-runtime.js"
	])
		await requireFile(root, relative);
	await requireFile(trackingRoot, "data/stage6-manual-coverage.json");
	for (const item of EQUIPMENT_ITEMS) {
		await requireFile(root, `behavior_pack/items/${item}.json`);
		if (!["copper_backtank_placeable", "netherite_backtank_placeable", "extendo_grip", "potato_cannon"].includes(item))
			await requireFile(root, `behavior_pack/recipes/${item}.json`);
	}
	for (const block of ["copper_backtank", "netherite_backtank"])
		await requireFile(root, `behavior_pack/blocks/${block}.json`);
	for (const model of ["copper_backtank", "netherite_backtank", "toolbox"])
		if (!JAVA_MODELS.some(candidate => candidate.name === model))
			throw new Error(`Stage 6 Java model conversion is missing ${model}`);
	for (const block of ["copper_backtank", "netherite_backtank"]) {
		const definition = await json(root, `behavior_pack/blocks/${block}.json`);
		if (definition["minecraft:block"]?.components?.["minecraft:geometry"] !== `geometry.createbedrock.${block}`)
			throw new Error(`Stage 6 ${block} must use its converted Java geometry`);
		const wearable = await json(root, `behavior_pack/items/${block}.json`);
		if (wearable["minecraft:item"]?.components?.["minecraft:block_placer"]?.block !== `createbedrock:${block}`)
			throw new Error(`Stage 6 wearable ${block} must preserve Java's direct block placement path`);
	}
	for (const color of TOOLBOX_COLORS) {
		await requireFile(root, `behavior_pack/blocks/${color}_toolbox.json`);
		await requireFile(root, `behavior_pack/loot_tables/blocks/${color}_toolbox.json`);
		await requireFile(root, `behavior_pack/recipes/${color}_toolbox.json`);
		const definition = await json(root, `behavior_pack/blocks/${color}_toolbox.json`);
		if (definition["minecraft:block"]?.components?.["minecraft:geometry"] !== "geometry.createbedrock.toolbox"
			|| !definition["minecraft:block"]?.components?.["minecraft:material_instances"]?.toolbox)
			throw new Error(`Stage 6 ${color} Toolbox must use the shared converted Java mesh`);
	}
	for (const block of ["copper_backtank", "netherite_backtank"])
		await requireFile(root, `behavior_pack/loot_tables/blocks/${block}.json`);
	for (const attachable of ["copper_diving_helmet", "copper_diving_boots", "netherite_diving_helmet", "netherite_diving_boots", "goggles"])
		await requireFile(root, `resource_pack/attachables/${attachable}.attachable.json`);

	const [itemAtlas, terrainAtlas, manual, mechanicalRecipes] = await Promise.all([
		json(root, "resource_pack/textures/item_texture.json"),
		json(root, "resource_pack/textures/terrain_texture.json"),
		json(trackingRoot, "data/stage6-manual-coverage.json"),
		json(trackingRoot, "data/recipes/mechanical-crafting.json")
	]);
	for (const icon of ["copper_backtank", "netherite_backtank", "copper_diving_helmet", "copper_diving_boots", "netherite_diving_helmet", "netherite_diving_boots", "goggles", "extendo_grip", "potato_cannon", "wrench"])
		if (!itemAtlas.texture_data?.[`createbedrock_${icon}`])
			throw new Error(`Stage 6 item atlas lacks ${icon}`);
	for (const texture of ["copper_backtank", "netherite_backtank", ...TOOLBOX_COLORS.map(color => `toolbox_${color}`)])
		if (!terrainAtlas.texture_data?.[`createbedrock_${texture}`])
			throw new Error(`Stage 6 terrain atlas lacks ${texture}`);
	const mechanicalRecipeIds = new Set(mechanicalRecipes.recipes?.map(recipe => recipe.id));
	if (!mechanicalRecipeIds.has("create:mechanical_crafting/extendo_grip") || !mechanicalRecipeIds.has("create:mechanical_crafting/potato_cannon"))
		throw new Error("Stage 6 requires the Extendo Grip and Potato Cannon mechanical-crafting mappings");
	if (manual.schemaVersion !== 1 || manual.backtank?.baseCapacity !== 900 || manual.backtank?.capacityPerEnchantmentLevel !== 300
		|| manual.toolbox?.colors?.length !== 16 || manual.toolbox?.compartments !== 8 || manual.toolbox?.slotsPerCompartment !== 4
		|| manual.platformAcceptance?.status !== "pending_real_platform_test")
		throw new Error("Stage 6 manual coverage is incomplete");

	const requiredBlockTextures = ["copper_backtank.png", "netherite_backtank.png", ...TOOLBOX_COLORS.map(color => `toolbox/${color}.png`)];
	const requiredItemTextures = ["copper_diving_boots.png", "copper_diving_helmet.png", "netherite_diving_boots.png", "netherite_diving_helmet.png", "extendo_grip.png", "goggles.png", "goggles_model.png", "potato_cannon.png", "wrench.png"];
	const requiredArmorTextures = ["models/armor/copper_diving_layer_1.png", "models/armor/netherite_diving_layer_1.png", "models/armor/netherite_diving_layer_2.png"];
	for (const texture of requiredBlockTextures)
		if (!JAVA_BLOCK_TEXTURES.includes(texture))
			throw new Error(`Stage 6 Java block texture is not staged: ${texture}`);
	for (const texture of requiredItemTextures)
		if (!JAVA_ITEM_TEXTURES.includes(texture))
			throw new Error(`Stage 6 Java item texture is not staged: ${texture}`);
	for (const texture of requiredArmorTextures)
		if (!JAVA_ARMOR_TEXTURES.includes(texture))
			throw new Error(`Stage 6 Java armor texture is not staged: ${texture}`);
	if (built) {
		for (const model of ["copper_backtank", "netherite_backtank", "toolbox"])
			await requireFile(root, `resource_pack/models/blocks/${model}.geo.json`);
		for (const texture of requiredBlockTextures)
			await requireFile(root, `resource_pack/textures/create_java/block/${texture}`);
		for (const texture of requiredItemTextures)
			await requireFile(root, `resource_pack/textures/create_java/item/${texture}`);
		for (const texture of requiredArmorTextures)
			await requireFile(root, `resource_pack/textures/create_java/${texture}`);
	} else {
		for (const texture of requiredBlockTextures)
			await requireFile(repositoryRoot, `src/main/resources/assets/create/textures/block/${texture}`);
		for (const texture of requiredItemTextures)
			await requireFile(repositoryRoot, `src/main/resources/assets/create/textures/item/${texture}`);
		for (const texture of requiredArmorTextures)
			await requireFile(repositoryRoot, `src/main/resources/assets/create/textures/${texture}`);
	}
	return { entries: entries.length, toolboxColors: TOOLBOX_COLORS.length };
}
