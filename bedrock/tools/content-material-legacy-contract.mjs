import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { JAVA_ITEM_TEXTURES } from "./import-java-assets.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(defaultBedrockRoot, "..");
const ITEMS = [
	{ name: "chromatic_compound", texture: "chromatic_compound_1.png", maxStack: 16 },
	{ name: "shadow_steel", texture: "shadow_steel.png", maxStack: 64 },
	{ name: "refined_radiance", texture: "refined_radiance.png", maxStack: 64 }
];

async function json(path) { return JSON.parse(await readFile(path, "utf8")); }
async function exists(path) { try { return (await stat(path)).isFile(); } catch { return false; } }
function languageKeys(contents) { return new Set(contents.split(/\r?\n/).map(line => line.split("=", 1)[0]).filter(Boolean)); }

export async function validateLegacyMaterials({ bedrockRoot = defaultBedrockRoot, built = false } = {}) {
	const behaviorRoot = resolve(bedrockRoot, "behavior_pack");
	const resourceRoot = resolve(bedrockRoot, "resource_pack");
	const [atlas, runtime, logic, main, en, zh] = await Promise.all([
		json(resolve(resourceRoot, "textures", "item_texture.json")),
		readFile(resolve(behaviorRoot, "scripts", "materials", "legacy-materials-runtime.js"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "materials", "legacy-materials.js"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "main.js"), "utf8"),
		readFile(resolve(resourceRoot, "texts", "en_US.lang"), "utf8"),
		readFile(resolve(resourceRoot, "texts", "zh_CN.lang"), "utf8")
	]);
	if (!runtime.includes("processChromaticEntity") || !runtime.includes("beaconBelow") || !runtime.includes("nearestLightSource")
		|| !runtime.includes("createbedrock:shadow_steel") || !runtime.includes("createbedrock:refined_radiance")
		|| !logic.includes("REFINED_RADIANCE_LIGHT_SOURCES = 10") || !main.includes("registerLegacyMaterials"))
		throw new Error("Legacy materials must retain chromatic light collection and both world-conversion paths");
	const languages = [languageKeys(en), languageKeys(zh)];
	for (const entry of ITEMS) {
		const identifier = `createbedrock:${entry.name}`;
		const icon = `createbedrock_${entry.name}`;
		const item = await json(resolve(behaviorRoot, "items", `${entry.name}.json`));
		const components = item["minecraft:item"]?.components ?? {};
		if (item["minecraft:item"]?.description?.identifier !== identifier || !item["minecraft:item"].description.menu_category?.category
			|| components["minecraft:icon"] !== icon || components["minecraft:max_stack_size"] !== entry.maxStack)
			throw new Error(`${identifier} must retain its registered item and stack behavior`);
		if (atlas.texture_data?.[icon]?.textures !== `textures/create_java/item/${entry.texture.slice(0, -4)}`
			|| !JAVA_ITEM_TEXTURES.includes(entry.texture))
			throw new Error(`${identifier} is missing its Java-derived item texture`);
		for (const keys of languages)
			if (!keys.has(`item.${identifier}.name`))
				throw new Error(`${identifier} is missing EN or ZH localization`);
		const texture = built
			? resolve(resourceRoot, "textures", "create_java", "item", entry.texture)
			: resolve(repositoryRoot, "src/main/resources/assets/create/textures/item", entry.texture);
		if (!await exists(texture))
			throw new Error(`${identifier} source or staged texture is missing`);
	}
	return { items: ITEMS.length, requiredLightSources: 10 };
}
