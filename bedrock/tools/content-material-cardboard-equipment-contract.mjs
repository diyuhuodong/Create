import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { JAVA_ARMOR_TEXTURES, JAVA_ITEM_TEXTURES } from "./import-java-assets.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(defaultBedrockRoot, "..");

const ARMOR = [
	["helmet", "slot.armor.head", 44, "geometry.humanoid.armor.helmet", "models/armor/cardboard_layer_1.png"],
	["chestplate", "slot.armor.chest", 64, "geometry.humanoid.armor.chestplate", "models/armor/cardboard_layer_1.png"],
	["leggings", "slot.armor.legs", 60, "geometry.humanoid.armor.leggings", "models/armor/cardboard_layer_2.png"],
	["boots", "slot.armor.feet", 52, "geometry.humanoid.armor.boots", "models/armor/cardboard_layer_1.png"]
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

/**
 * Validates the direct Java-asset and native-component port of cardboard
 * equipment. Its full-set crouch behavior is registered separately because
 * the Java invisibility/AI hooks do not map to an item component.
 */
export async function validateCardboardEquipment({ bedrockRoot = defaultBedrockRoot, built = false } = {}) {
	const behaviorRoot = resolve(bedrockRoot, "behavior_pack");
	const resourceRoot = resolve(bedrockRoot, "resource_pack");
	const [itemAtlas, en, zh, runtime, main] = await Promise.all([
		readJson(resolve(resourceRoot, "textures", "item_texture.json")),
		readFile(resolve(resourceRoot, "texts", "en_US.lang"), "utf8"),
		readFile(resolve(resourceRoot, "texts", "zh_CN.lang"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "materials", "cardboard-equipment-runtime.js"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "main.js"), "utf8")
	]);
	const languages = [languageKeys(en), languageKeys(zh)];
	for (const [name, slot, durability, geometry, armorTexture] of ARMOR) {
		const identifier = `createbedrock:cardboard_${name}`;
		const [item, recipe, attachable] = await Promise.all([
			readJson(resolve(behaviorRoot, "items", `cardboard_${name}.json`)),
			readJson(resolve(behaviorRoot, "recipes", `cardboard_${name}.json`)),
			readJson(resolve(resourceRoot, "attachables", `cardboard_${name}.attachable.json`))
		]);
		const components = item["minecraft:item"]?.components ?? {};
		if (item["minecraft:item"]?.description?.identifier !== identifier
			|| components["minecraft:icon"] !== `createbedrock_cardboard_${name}`
			|| components["minecraft:max_stack_size"] !== 1
			|| components["minecraft:wearable"]?.slot !== slot
			|| components["minecraft:wearable"]?.protection !== 1
			|| components["minecraft:durability"]?.max_durability !== durability
			|| components["minecraft:fuel"]?.duration !== 1000
			|| !components["minecraft:tags"]?.tags?.includes("minecraft:is_armor"))
			throw new Error(`Cardboard ${name} must retain its native armor, durability, fuel, and icon components`);
		if (itemAtlas.texture_data?.[`createbedrock_cardboard_${name}`]?.textures !== `textures/create_java/item/cardboard_${name}`
			|| !JAVA_ITEM_TEXTURES.includes(`cardboard_${name}.png`))
			throw new Error(`Cardboard ${name} is missing its Java item texture`);
		if (!languages.every(keys => keys.has(`item.${identifier}.name`)))
			throw new Error(`Cardboard ${name} is missing EN/ZH localization`);
		if (recipe["minecraft:recipe_shaped"]?.result?.item !== identifier
			|| recipe["minecraft:recipe_shaped"]?.key?.P?.item !== "createbedrock:cardboard")
			throw new Error(`Cardboard ${name} must retain its direct cardboard crafting recipe`);
		const description = attachable["minecraft:attachable"]?.description;
		if (description?.identifier !== identifier || description.geometry?.default !== geometry
			|| description.textures?.default !== `textures/create_java/${armorTexture.slice(0, -4)}`
			|| !description.render_controllers?.includes("controller.render.armor"))
			throw new Error(`Cardboard ${name} must retain its equipped armor visual`);
		const sourceTexture = built
			? resolve(resourceRoot, "textures", "create_java", armorTexture)
			: resolve(repositoryRoot, "src/main/resources/assets/create/textures", armorTexture);
		if (!JAVA_ARMOR_TEXTURES.includes(armorTexture) || !await fileExists(sourceTexture))
			throw new Error(`Cardboard ${name} is missing its Java armor texture`);
	}

	const sword = await readJson(resolve(behaviorRoot, "items", "cardboard_sword.json"));
	const swordRecipe = await readJson(resolve(behaviorRoot, "recipes", "cardboard_sword.json"));
	const swordComponents = sword["minecraft:item"]?.components ?? {};
	if (sword["minecraft:item"]?.description?.identifier !== "createbedrock:cardboard_sword"
		|| swordComponents["minecraft:damage"] !== 5
		|| swordComponents["minecraft:hand_equipped"] !== true
		|| swordComponents["minecraft:fuel"]?.duration !== 1000
		|| swordRecipe["minecraft:recipe_shaped"]?.key?.P?.item !== "createbedrock:cardboard"
		|| swordRecipe["minecraft:recipe_shaped"]?.key?.S?.item !== "minecraft:stick")
		throw new Error("Cardboard sword must retain its direct recipe, damage baseline, fuel, and hand behavior");
	if (!runtime.includes("world.beforeEvents.entityHurt") || !runtime.includes("event.cancel = true")
		|| !runtime.includes("cardboardSwordImpulse") || !runtime.includes("world.afterEvents.entityHitBlock")
		|| !main.includes("registerCardboardEquipment()"))
		throw new Error("Cardboard equipment must retain stealth and non-damaging sword runtime wiring");
	return { armorItems: ARMOR.length, items: ARMOR.length + 1 };
}
