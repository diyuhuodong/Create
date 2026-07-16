import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { JAVA_ITEM_TEXTURES } from "./import-java-assets.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(defaultBedrockRoot, "..");
const EXPERIENCE_NUGGET = "createbedrock:experience_nugget";

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
 * The nugget's Java use code consumes one unit when sneaking or the whole
 * held stack otherwise, then redeems three experience points per unit.  The
 * stable Bedrock API grants the equivalent total directly because vanilla XP
 * orb values cannot be configured through the public Script API.
 */
export async function validateContentMaterialSpecialItems({ bedrockRoot = defaultBedrockRoot, built = false } = {}) {
	const behaviorRoot = resolve(bedrockRoot, "behavior_pack");
	const resourceRoot = resolve(bedrockRoot, "resource_pack");
	const [itemDefinition, compactRecipe, expandRecipe, itemAtlas, enUs, zhCn, runtime, helper, main] = await Promise.all([
		readJson(resolve(behaviorRoot, "items", "experience_nugget.json")),
		readJson(resolve(behaviorRoot, "recipes", "experience_block.json")),
		readJson(resolve(behaviorRoot, "recipes", "experience_nugget_from_block.json")),
		readJson(resolve(resourceRoot, "textures", "item_texture.json")),
		readFile(resolve(resourceRoot, "texts", "en_US.lang"), "utf8"),
		readFile(resolve(resourceRoot, "texts", "zh_CN.lang"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "materials", "experience-nugget-runtime.js"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "materials", "experience-nugget.js"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "main.js"), "utf8")
	]);
	const components = itemDefinition["minecraft:item"]?.components ?? {};
	if (itemDefinition["minecraft:item"]?.description?.identifier !== EXPERIENCE_NUGGET
		|| !itemDefinition["minecraft:item"]?.description?.menu_category?.category
		|| components["minecraft:icon"] !== "createbedrock_experience_nugget"
		|| components["minecraft:max_stack_size"] !== 64
		|| components["minecraft:allow_off_hand"] !== true
		|| components["minecraft:interact_button"] !== true)
		throw new Error("C1 experience nugget must preserve its creative item, full stack, and either-hand use contract");
	const compact = compactRecipe["minecraft:recipe_shaped"];
	const expand = expandRecipe["minecraft:recipe_shapeless"];
	if (compact?.description?.identifier !== "createbedrock:experience_block"
		|| JSON.stringify(compact.pattern) !== JSON.stringify(["###", "###", "###"])
		|| compact.key?.["#"]?.item !== EXPERIENCE_NUGGET
		|| compact.result?.item !== "createbedrock:experience_block"
		|| expand?.description?.identifier !== "createbedrock:experience_nugget_from_block"
		|| expand.ingredients?.length !== 1
		|| expand.ingredients?.[0]?.item !== "createbedrock:experience_block"
		|| expand.result?.item !== EXPERIENCE_NUGGET
		|| expand.result?.count !== 9)
		throw new Error("C1 experience storage recipes must preserve the Java nine-nugget block conversion in both directions");
	if (itemAtlas.texture_data?.createbedrock_experience_nugget?.textures !== "textures/create_java/item/experience_nugget"
		|| !JAVA_ITEM_TEXTURES.includes("experience_nugget.png"))
		throw new Error("C1 experience nugget must retain its Java-derived item texture");
	const textureFile = built
		? resolve(resourceRoot, "textures", "create_java", "item", "experience_nugget.png")
		: resolve(repositoryRoot, "src/main/resources/assets/create/textures/item/experience_nugget.png");
	if (!await fileExists(textureFile))
		throw new Error(`C1 experience nugget is missing Java-derived texture ${textureFile}`);
	for (const contents of [enUs, zhCn]) {
		if (!languageKeys(contents).has(`item.${EXPERIENCE_NUGGET}.name`))
			throw new Error("C1 experience nugget must have EN and ZH localization");
	}
	if (!helper.includes("EXPERIENCE_PER_NUGGET = 3")
		|| !helper.includes("isSneaking ? 1 : count")
		|| !runtime.includes("player.addExperience(plan.experience)")
		|| !runtime.includes("EquipmentSlot.Offhand")
		|| !main.includes("registerExperienceNugget();"))
		throw new Error("C1 experience nugget must retain its Java-equivalent redemption and offhand runtime contract");
	return {
		contentItems: 1,
		deferredSurvivalAcquisitions: [{
			identifier: EXPERIENCE_NUGGET,
			dependency: "Mechanical crushing must add the Java experience-nugget byproducts before the reversible crafting recipes have an in-survival source."
		}]
	};
}
