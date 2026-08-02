import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { JAVA_BLOCK_TEXTURES } from "./import-java-assets.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(defaultBedrockRoot, "..");

async function json(path) { return JSON.parse(await readFile(path, "utf8")); }
async function exists(path) { try { return (await stat(path)).isFile(); } catch { return false; } }
function languageKeys(contents) { return new Set(contents.split(/\r?\n/).map(line => line.split("=", 1)[0]).filter(Boolean)); }

export async function validateNozzleMaterial({ bedrockRoot = defaultBedrockRoot, built = false } = {}) {
	const behaviorRoot = resolve(bedrockRoot, "behavior_pack");
	const resourceRoot = resolve(bedrockRoot, "resource_pack");
	const [block, recipe, loot, terrain, runtime, logic, main, en, zh] = await Promise.all([
		json(resolve(behaviorRoot, "blocks", "nozzle.json")),
		json(resolve(behaviorRoot, "recipes", "nozzle.json")),
		json(resolve(behaviorRoot, "loot_tables", "blocks", "nozzle.json")),
		json(resolve(resourceRoot, "textures", "terrain_texture.json")),
		readFile(resolve(behaviorRoot, "scripts", "materials", "nozzle-runtime.js"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "materials", "nozzle.js"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "main.js"), "utf8"),
		readFile(resolve(resourceRoot, "texts", "en_US.lang"), "utf8"),
		readFile(resolve(resourceRoot, "texts", "zh_CN.lang"), "utf8")
	]);
	const definition = block["minecraft:block"];
	if (definition?.description?.identifier !== "createbedrock:nozzle" || !definition.description.menu_category?.category
		|| definition.components?.["minecraft:geometry"] !== "geometry.createbedrock.nozzle"
		|| definition.components?.["minecraft:loot"] !== "loot_tables/blocks/nozzle.json"
		|| (definition.description.states ?? definition.description.properties)?.["createbedrock:active"]?.join(",") !== "0,1")
		throw new Error("Nozzle must retain its directional visual, loot, and active-state block definition");
	const shaped = recipe["minecraft:recipe_shaped"];
	if (shaped?.description?.identifier !== "createbedrock:nozzle" || shaped.pattern?.join(",") !== " A , W ,AAA"
		|| shaped.key?.A?.item !== "createbedrock:andesite_alloy" || shaped.key?.W?.tag !== "minecraft:wool"
		|| shaped.result?.item !== "createbedrock:nozzle" || loot.pools?.[0]?.entries?.[0]?.name !== "createbedrock:nozzle")
		throw new Error("Nozzle must retain its Andesite Alloy and wool crafting path and self drop");
	if (!runtime.includes("getKineticSpeedAt") || !runtime.includes("pushEntities") || !runtime.includes("registerMovingBlockDataContributor")
		|| !logic.includes("FAN_ROTATION_ARGMAX = 256") || !logic.includes("NOZZLE_MAX_RANGE = 20") || !main.includes("registerNozzles"))
		throw new Error("Nozzle must retain fan speed scaling, entity impulse, and contraption persistence behavior");
	if (terrain.texture_data?.createbedrock_nozzle_net?.textures !== "textures/create_java/block/net" || !JAVA_BLOCK_TEXTURES.includes("net.png"))
		throw new Error("Nozzle must retain its Java net texture");
	for (const keys of [languageKeys(en), languageKeys(zh)])
		if (!keys.has("tile.createbedrock:nozzle.name"))
			throw new Error("Nozzle is missing EN or ZH localization");
	const texture = built
		? resolve(resourceRoot, "textures", "create_java", "block", "net.png")
		: resolve(repositoryRoot, "src/main/resources/assets/create/textures/block/net.png");
	if (!await exists(texture))
		throw new Error("Nozzle source or staged net texture is missing");
	return { blocks: 1, persistenceSchema: 1 };
}
