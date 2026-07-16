import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { JAVA_ITEM_TEXTURES } from "./import-java-assets.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(defaultBedrockRoot, "..");
const CRUSHED = ["copper", "gold", "iron", "zinc"];

async function readJson(file) {
	return JSON.parse(await readFile(file, "utf8"));
}

async function fileExists(file) {
	try { return (await stat(file)).isFile(); } catch { return false; }
}

export async function validateCrushedRawMaterials({ bedrockRoot = defaultBedrockRoot, built = false } = {}) {
	const behaviorRoot = resolve(bedrockRoot, "behavior_pack");
	const resourceRoot = resolve(bedrockRoot, "resource_pack");
	const [atlas, crushing, fan, support] = await Promise.all([
		readJson(resolve(resourceRoot, "textures", "item_texture.json")),
		readFile(resolve(behaviorRoot, "scripts", "processing", "generated", "crushing-recipes.js"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "processing", "generated", "fan-recipes.js"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "processing", "processing-item-support.js"), "utf8")
	]);
	for (const metal of CRUSHED) {
		const identifier = `createbedrock:crushed_raw_${metal}`;
		const icon = `createbedrock_crushed_raw_${metal}`;
		const item = await readJson(resolve(behaviorRoot, "items", `crushed_raw_${metal}.json`));
		if (item["minecraft:item"]?.description?.identifier !== identifier || item["minecraft:item"].components?.["minecraft:icon"] !== icon)
			throw new Error(`Crushed ${metal} must retain a direct Bedrock item definition`);
		if (atlas.texture_data?.[icon]?.textures !== `textures/create_java/item/crushed_raw_${metal}` || !JAVA_ITEM_TEXTURES.includes(`crushed_raw_${metal}.png`))
			throw new Error(`Crushed ${metal} is missing its Java item texture mapping`);
		const texture = built
			? resolve(resourceRoot, `textures/create_java/item/crushed_raw_${metal}.png`)
			: resolve(repositoryRoot, `src/main/resources/assets/create/textures/item/crushed_raw_${metal}.png`);
		if (!await fileExists(texture))
			throw new Error(`Crushed ${metal} source or staged texture is missing`);
		if (!support.includes(`"${identifier}"`))
			throw new Error(`Crushed ${metal} is not admitted to the processing import whitelist`);
	}
	for (const recipe of ["zinc_ore", "iron_ore", "copper_ore", "gold_ore"]) {
		if (!crushing.includes(`create:crushing/${recipe}`))
			throw new Error(`Crushing recipe ${recipe} was not regenerated after crushed-raw registration`);
	}
	for (const metal of CRUSHED) {
		if (!fan.includes(`splashing/crushed_raw_${metal}`))
			throw new Error(`Splashing recipe for crushed ${metal} was not regenerated`);
	}
	return { crushedItems: CRUSHED.length, supportItems: 2 };
}
