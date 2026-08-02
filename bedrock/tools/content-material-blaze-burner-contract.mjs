import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { JAVA_BLOCK_TEXTURES } from "./import-java-assets.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(defaultBedrockRoot, "..");

async function readJson(file) {
	return JSON.parse(await readFile(file, "utf8"));
}

async function fileExists(file) {
	try { return (await stat(file)).isFile(); } catch { return false; }
}

export async function validateBlazeBurnerContract({ bedrockRoot = defaultBedrockRoot, built = false } = {}) {
	const behaviorRoot = resolve(bedrockRoot, "behavior_pack");
	const resourceRoot = resolve(bedrockRoot, "resource_pack");
	const [burner, lit, empty, recipe, atlas, runtime, main] = await Promise.all([
		readJson(resolve(behaviorRoot, "blocks", "blaze_burner.json")),
		readJson(resolve(behaviorRoot, "blocks", "lit_blaze_burner.json")),
		readJson(resolve(behaviorRoot, "items", "empty_blaze_burner.json")),
		readJson(resolve(behaviorRoot, "recipes", "empty_blaze_burner.json")),
		readJson(resolve(resourceRoot, "textures", "terrain_texture.json")),
		readFile(resolve(behaviorRoot, "scripts", "materials", "blaze-burner-runtime.js"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "main.js"), "utf8")
	]);
	const burnerDefinition = burner["minecraft:block"];
	if (burnerDefinition?.description?.identifier !== "createbedrock:blaze_burner"
		|| !(burnerDefinition.description.states ?? burnerDefinition.description.properties)?.["createbedrock:heat_level"]?.includes(4)
		|| burnerDefinition.components?.["minecraft:geometry"] !== "geometry.createbedrock.blaze_burner"
		|| burnerDefinition.components?.["minecraft:loot"] !== "loot_tables/blocks/blaze_burner.json")
		throw new Error("Blaze Burner must expose its five heat states, Java-derived geometry, and explicit loot");
	if (lit["minecraft:block"]?.description?.identifier !== "createbedrock:lit_blaze_burner"
		|| !(lit["minecraft:block"].description.states ?? lit["minecraft:block"].description.properties)?.["createbedrock:flame_type"]?.includes("soul")
		|| lit["minecraft:block"].components?.["minecraft:loot"] !== "loot_tables/blocks/lit_blaze_burner.json")
		throw new Error("Lit Blaze Burner must preserve regular and soul flame states with empty-burner loot");
	const components = empty["minecraft:item"]?.components;
	if (empty["minecraft:item"]?.description?.identifier !== "createbedrock:empty_blaze_burner"
		|| components?.["minecraft:icon"] !== "createbedrock_empty_blaze_burner"
		|| components?.["minecraft:block_placer"]?.block !== "createbedrock:blaze_burner"
		|| recipe["minecraft:recipe_shaped"]?.result?.item !== "createbedrock:empty_blaze_burner")
		throw new Error("Empty Blaze Burner must have its icon, placement behavior, and Java-equivalent crafting path");
	for (const texture of ["blaze_active.png", "blaze_burner_flame.png", "blaze_heater_brazier.png", "blaze_heater_brazier_soul.png", "blaze_idle.png", "blaze_inert.png", "blaze_super.png"]) {
		if (!JAVA_BLOCK_TEXTURES.includes(texture))
			throw new Error(`Blaze Burner Java texture ${texture} is not staged by the build`);
	}
	if (!atlas.texture_data?.createbedrock_blaze_heater_brazier?.textures)
		throw new Error("Blaze Burner is missing its terrain atlas mapping");
	const texture = built
		? resolve(resourceRoot, "textures/create_java/block/blaze_heater_brazier.png")
		: resolve(repositoryRoot, "src/main/resources/assets/create/textures/block/blaze_heater_brazier.png");
	if (!await fileExists(texture))
		throw new Error("Blaze Burner source or staged brazier texture is missing");
	if (!runtime.includes("ShardedStateStore") || !runtime.includes("tickBurnerFuel") || !runtime.includes("playerInteractWithEntity")
		|| !main.includes("registerBlazeBurners()"))
		throw new Error("Blaze Burner must retain persistent heat, fuel decay, capture, and main-runtime wiring");
	return { blocks: 2, items: 1, textures: 7 };
}
