import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { JAVA_ITEM_TEXTURES } from "./import-java-assets.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(defaultBedrockRoot, "..");
const PAPERS = [
	{ name: "sand_paper", ingredient: "minecraft:sand" },
	{ name: "red_sand_paper", ingredient: "minecraft:red_sand" }
];

async function json(path) {
	return JSON.parse(await readFile(path, "utf8"));
}

async function exists(path) {
	try { return (await stat(path)).isFile(); } catch { return false; }
}

function languageKeys(contents) {
	return new Set(contents.split(/\r?\n/).map(line => line.split("=", 1)[0]).filter(Boolean));
}

export async function validateSandpaperMaterials({ bedrockRoot = defaultBedrockRoot, built = false } = {}) {
	const behaviorRoot = resolve(bedrockRoot, "behavior_pack");
	const resourceRoot = resolve(bedrockRoot, "resource_pack");
	const [atlas, runtime, material, en, zh] = await Promise.all([
		json(resolve(resourceRoot, "textures", "item_texture.json")),
		readFile(resolve(behaviorRoot, "scripts", "materials", "sandpaper-runtime.js"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "materials", "sandpaper.js"), "utf8"),
		readFile(resolve(resourceRoot, "texts", "en_US.lang"), "utf8"),
		readFile(resolve(resourceRoot, "texts", "zh_CN.lang"), "utf8")
	]);
	if (!runtime.includes("world.afterEvents.itemUse") || !runtime.includes("world.afterEvents.itemUseOn")
		|| !runtime.includes("damageSandpaper") || !runtime.includes("sandBlockWithPaper")
		|| !material.includes("POLISHING_RECIPES") || !material.includes("copperTransformFor"))
		throw new Error("Sandpaper must retain offhand polishing, durability, and copper scrape/wax-removal behavior");
	const languages = [languageKeys(en), languageKeys(zh)];
	for (const paper of PAPERS) {
		const identifier = `createbedrock:${paper.name}`;
		const icon = `createbedrock_${paper.name}`;
		const [item, recipe] = await Promise.all([
			json(resolve(behaviorRoot, "items", `${paper.name}.json`)),
			json(resolve(behaviorRoot, "recipes", `${paper.name}.json`))
		]);
		const components = item["minecraft:item"]?.components ?? {};
		if (item["minecraft:item"]?.description?.identifier !== identifier || !item["minecraft:item"].description.menu_category?.category
			|| components["minecraft:icon"] !== icon || components["minecraft:max_stack_size"] !== 1
			|| components["minecraft:durability"]?.max_durability !== 8 || components["minecraft:allow_off_hand"] !== true)
			throw new Error(`${identifier} must retain its one-stack, eight-use offhand-capable item definition`);
		const shaping = recipe["minecraft:recipe_shapeless"];
		if (shaping?.description?.identifier !== identifier || shaping.tags?.[0] !== "crafting_table"
			|| shaping.ingredients?.[0]?.item !== "minecraft:paper" || shaping.ingredients?.[1]?.item !== paper.ingredient
			|| shaping.result?.item !== identifier)
			throw new Error(`${identifier} must retain its Java paper-and-sand crafting path`);
		if (atlas.texture_data?.[icon]?.textures !== `textures/create_java/item/${paper.name}` || !JAVA_ITEM_TEXTURES.includes(`${paper.name}.png`))
			throw new Error(`${identifier} is missing its Java item texture mapping`);
		for (const keys of languages)
			if (!keys.has(`item.${identifier}.name`))
				throw new Error(`${identifier} is missing EN or ZH localization`);
		const texture = built
			? resolve(resourceRoot, "textures", "create_java", "item", `${paper.name}.png`)
			: resolve(repositoryRoot, "src/main/resources/assets/create/textures/item", `${paper.name}.png`);
		if (!await exists(texture))
			throw new Error(`${identifier} source or staged texture is missing`);
	}
	const polished = await json(resolve(behaviorRoot, "items", "polished_rose_quartz.json"));
	if (polished["minecraft:item"]?.description?.identifier !== "createbedrock:polished_rose_quartz"
		|| polished["minecraft:item"].components?.["minecraft:icon"] !== "createbedrock_polished_rose_quartz"
		|| atlas.texture_data?.createbedrock_polished_rose_quartz?.textures !== "textures/create_java/item/polished_rose_quartz"
		|| !JAVA_ITEM_TEXTURES.includes("polished_rose_quartz.png"))
		throw new Error("Polished rose quartz must retain its sandpaper output item and Java-derived texture");
	return { papers: PAPERS.length, polishingOutputs: 1 };
}
