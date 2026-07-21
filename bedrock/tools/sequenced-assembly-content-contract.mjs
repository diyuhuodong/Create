import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { JAVA_ITEM_TEXTURES } from "./import-java-assets.mjs";
import { isSupportedProcessingItem } from "../behavior_pack/scripts/processing/processing-item-support.js";

const ITEM_CONTENT = [
	{ id: "createbedrock:powdered_obsidian", name: "powdered_obsidian", visible: true },
	{ id: "createbedrock:precision_mechanism", name: "precision_mechanism", visible: true },
	{ id: "createbedrock:sturdy_sheet", name: "sturdy_sheet", visible: true },
	{ id: "createbedrock:incomplete_precision_mechanism", name: "incomplete_precision_mechanism", visible: false },
	{ id: "createbedrock:unprocessed_obsidian_sheet", name: "unprocessed_obsidian_sheet", visible: false },
	{ id: "createbedrock:incomplete_track", name: "incomplete_track", visible: false }
];

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
		throw new Error(`P7.2 sequenced-assembly content: ${message}`);
}

export async function validateSequencedAssemblyContent({ bedrockRoot, dataRoot = bedrockRoot, built = false }) {
	if (!bedrockRoot)
		throw new TypeError("P7.2 sequenced-assembly content validation requires a Bedrock root");
	const behaviorRoot = resolve(bedrockRoot, "behavior_pack");
	const resourceRoot = resolve(bedrockRoot, "resource_pack");
	const [atlas, english, chinese, crushingRecipes, sequenceRecipes] = await Promise.all([
		readJson(resolve(resourceRoot, "textures", "item_texture.json")),
		readFile(resolve(resourceRoot, "texts", "en_US.lang"), "utf8"),
		readFile(resolve(resourceRoot, "texts", "zh_CN.lang"), "utf8"),
		readJson(resolve(dataRoot, "data", "recipes", "crushing.json")),
		readJson(resolve(dataRoot, "data", "recipes", "sequenced-assembly.json"))
	]);
	for (const entry of ITEM_CONTENT) {
		const item = await readJson(resolve(behaviorRoot, "items", `${entry.name}.json`));
		const definition = item["minecraft:item"];
		const icon = `createbedrock_${entry.name}`;
		assert(definition?.description?.identifier === entry.id, `${entry.name} has the wrong item identifier`);
		assert(definition?.components?.["minecraft:icon"] === icon, `${entry.name} has the wrong icon`);
		assert(definition?.components?.["minecraft:max_stack_size"] === 64, `${entry.name} must stack to 64`);
		assert(Boolean(definition.description.menu_category) === entry.visible, `${entry.name} creative-menu visibility differs from Java's intermediate-item role`);
		assert(atlas.texture_data?.[icon]?.textures === `textures/create_java/item/${entry.name}`, `${entry.name} item atlas entry is missing`);
		assert(languageHas(english, `item.${entry.id}.name`), `${entry.name} English name is missing`);
		assert(languageHas(chinese, `item.${entry.id}.name`), `${entry.name} Chinese name is missing`);
		assert(JAVA_ITEM_TEXTURES.includes(`${entry.name}.png`), `${entry.name} Java texture is not staged`);
		if (built)
			assert(await fileExists(resolve(resourceRoot, "textures", "create_java", "item", `${entry.name}.png`)), `${entry.name} texture is missing from the build`);
	}
	assert(isSupportedProcessingItem("createbedrock:powdered_obsidian"), "Powdered Obsidian is not accepted by processing runtimes");
	const obsidian = crushingRecipes.find(recipe => recipe.id === "create:crushing/obsidian:0");
	assert(obsidian?.input?.typeId === "minecraft:obsidian" && obsidian.input?.count === 1, "Obsidian crushing input differs from Java");
	assert(obsidian?.processingTicks === 500, "Obsidian crushing duration differs from Java");
	assert(obsidian.outputs?.length === 2 && obsidian.outputs[0]?.typeId === "createbedrock:powdered_obsidian"
		&& obsidian.outputs[0]?.chance === 1 && obsidian.outputs[1]?.typeId === "minecraft:obsidian" && obsidian.outputs[1]?.chance === .75,
		"Obsidian crushing outputs differ from Java");
	const ids = new Set(sequenceRecipes.recipes.map(recipe => recipe.id));
	assert(ids.has("create:sequenced_assembly/precision_mechanism") && ids.has("create:sequenced_assembly/sturdy_sheet") && ids.has("create:sequenced_assembly/track"),
		"Sequenced-assembly IR is missing a Java recipe");
	return { items: ITEM_CONTENT.length, sequencedRecipes: ids.size };
}
