import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { plannedGeometryIdentifiers } from "./convert-java-models.mjs";
import { JAVA_BLOCK_TEXTURES } from "./import-java-assets.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(defaultBedrockRoot, "..");
const SAILS = [
	{ name: "sail_frame", texture: "createbedrock_sail_frame", sourceTexture: "sail/frame.png" },
	{ name: "white_sail", texture: "createbedrock_white_sail", sourceTexture: "sail/canvas_white.png" }
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

export async function validateSailMaterials({ bedrockRoot = defaultBedrockRoot, built = false } = {}) {
	const behaviorRoot = resolve(bedrockRoot, "behavior_pack");
	const resourceRoot = resolve(bedrockRoot, "resource_pack");
	const [atlas, movable, runtime, sailLogic, en, zh] = await Promise.all([
		json(resolve(resourceRoot, "textures", "terrain_texture.json")),
		readFile(resolve(behaviorRoot, "scripts", "contraptions", "movable-blocks.js"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "contraptions", "contraption-runtime.js"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "contraptions", "windmill-sails.js"), "utf8"),
		readFile(resolve(resourceRoot, "texts", "en_US.lang"), "utf8"),
		readFile(resolve(resourceRoot, "texts", "zh_CN.lang"), "utf8")
	]);
	if (!runtime.includes("windmillSailCount") || !runtime.includes("windmillSpeedForSailCount")
		|| !sailLogic.includes("MINIMUM_WINDMILL_SAILS"))
		throw new Error("Windmill runtime must derive source speed from explicit sail blocks and the minimum-sail gate");
	const languages = [languageKeys(en), languageKeys(zh)];
	for (const sail of SAILS) {
		const identifier = `createbedrock:${sail.name}`;
		const [block, loot] = await Promise.all([
			json(resolve(behaviorRoot, "blocks", `${sail.name}.json`)),
			json(resolve(behaviorRoot, "loot_tables", "blocks", `${sail.name}.json`))
		]);
		const definition = block["minecraft:block"];
		if (definition?.description?.identifier !== identifier || !definition.description.menu_category?.category
			|| definition.components?.["minecraft:geometry"] !== `geometry.createbedrock.${sail.name}`
			|| definition.components?.["minecraft:loot"] !== `loot_tables/blocks/${sail.name}.json`
			|| loot.pools?.[0]?.entries?.[0]?.name !== identifier)
			throw new Error(`${identifier} must retain a Java-derived, creative, self-dropping block definition`);
		if (atlas.texture_data?.[sail.texture]?.textures !== `textures/create_java/block/${sail.sourceTexture.slice(0, -4)}`
			|| !JAVA_BLOCK_TEXTURES.includes(sail.sourceTexture))
			throw new Error(`${identifier} is missing its Java texture import`);
		if (!movable.includes(`"${identifier}"`))
			throw new Error(`${identifier} must be movable by a windmill bearing`);
		for (const keys of languages)
			if (!keys.has(`tile.${identifier}.name`))
				throw new Error(`${identifier} is missing EN or ZH localization`);
		const texture = built
			? resolve(resourceRoot, "textures", "create_java", "block", sail.sourceTexture)
			: resolve(repositoryRoot, "src/main/resources/assets/create/textures/block", sail.sourceTexture);
		if (!await exists(texture))
			throw new Error(`${identifier} source or staged texture is missing`);
	}
	for (const geometry of ["geometry.createbedrock.sail_frame", "geometry.createbedrock.white_sail"])
		if (!plannedGeometryIdentifiers().has(geometry))
			throw new Error(`${geometry} must be scheduled for Java model conversion`);
	const [whiteSail, frame, conversion] = await Promise.all([
		json(resolve(behaviorRoot, "recipes", "white_sail.json")),
		json(resolve(behaviorRoot, "recipes", "sail_frame.json")),
		json(resolve(behaviorRoot, "recipes", "white_sail_from_frame.json"))
	]);
	if (whiteSail["minecraft:recipe_shaped"]?.result?.item !== "createbedrock:white_sail"
		|| whiteSail["minecraft:recipe_shaped"].result?.count !== 2
		|| frame["minecraft:recipe_shapeless"]?.ingredients?.[0]?.item !== "createbedrock:white_sail"
		|| conversion["minecraft:recipe_shapeless"]?.ingredients?.[0]?.item !== "createbedrock:sail_frame")
		throw new Error("Sails must retain their primary crafting and reversible frame conversion paths");
	return { sailBlocks: SAILS.length, minimumSails: 8 };
}
