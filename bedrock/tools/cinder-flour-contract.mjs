import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { JAVA_ITEM_TEXTURES } from "./import-java-assets.mjs";
import { isSupportedProcessingItem } from "../behavior_pack/scripts/processing/processing-item-support.js";

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

function languageHas(contents, key) {
	return contents.split(/\r?\n/).some(line => line.startsWith(`${key}=`));
}

function assert(condition, message) {
	if (!condition)
		throw new Error(`P7.1B cinder-flour chain: ${message}`);
}

export async function validateCinderFlourChain({ bedrockRoot, dataRoot = bedrockRoot, built = false }) {
	if (!bedrockRoot)
		throw new TypeError("P7.1B cinder-flour validation requires a Bedrock root");
	const behaviorRoot = resolve(bedrockRoot, "behavior_pack");
	const resourceRoot = resolve(bedrockRoot, "resource_pack");
	const [item, atlas, english, chinese, crushingRecipes] = await Promise.all([
		readJson(resolve(behaviorRoot, "items", "cinder_flour.json")),
		readJson(resolve(resourceRoot, "textures", "item_texture.json")),
		readFile(resolve(resourceRoot, "texts", "en_US.lang"), "utf8"),
		readFile(resolve(resourceRoot, "texts", "zh_CN.lang"), "utf8"),
		readJson(resolve(dataRoot, "data", "recipes", "crushing.json"))
	]);
	const createItem = item["minecraft:item"];
	assert(createItem?.description?.identifier === "createbedrock:cinder_flour", "item definition has the wrong identifier");
	assert(createItem?.components?.["minecraft:icon"] === "createbedrock_cinder_flour", "item definition has the wrong icon");
	assert(createItem?.components?.["minecraft:max_stack_size"] === 64, "item definition must stack to 64");
	assert(atlas.texture_data?.createbedrock_cinder_flour?.textures === "textures/create_java/item/cinder_flour", "item atlas entry is missing or wrong");
	assert(languageHas(english, "item.createbedrock:cinder_flour.name"), "English item name is missing");
	assert(languageHas(chinese, "item.createbedrock:cinder_flour.name"), "Chinese item name is missing");
	assert(JAVA_ITEM_TEXTURES.includes("cinder_flour.png"), "Java cinder-flour texture is not staged");
	if (built)
		assert(await fileExists(resolve(resourceRoot, "textures", "create_java", "item", "cinder_flour.png")), "Java cinder-flour texture was not staged in the build");
	assert(isSupportedProcessingItem("createbedrock:cinder_flour"), "cinder flour is not accepted by processing runtimes");

	const recipe = crushingRecipes.find(candidate => candidate.id === "create:crushing/netherrack:0");
	assert(recipe?.input?.typeId === "minecraft:netherrack" && recipe.input?.count === 1, "netherrack crushing input is wrong");
	assert(recipe?.processingTicks === 250, "netherrack crushing duration differs from Java");
	assert(recipe?.outputs?.length === 2
		&& recipe.outputs[0]?.typeId === "createbedrock:cinder_flour"
		&& recipe.outputs[0]?.count === 1
		&& recipe.outputs[0]?.chance === 1
		&& recipe.outputs[1]?.typeId === "createbedrock:cinder_flour"
		&& recipe.outputs[1]?.count === 1
		&& recipe.outputs[1]?.chance === 0.5, "netherrack crushing outputs differ from Java");
	return { items: 1, crushingRecipes: 1 };
}
