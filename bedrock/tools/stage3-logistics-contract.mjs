import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");

export const S3_10_LOGISTICS_BLOCKS = [
	"andesite_belt_funnel",
	"andesite_tunnel",
	"belt",
	"brass_belt_funnel",
	"brass_funnel",
	"brass_tunnel",
	"chute",
	"creative_crate",
	"depot",
	"item_hatch",
	"item_vault",
	"smart_chute",
	"weighted_ejector"
];

export const S3_10_LOGISTICS_ITEMS = ["attribute_filter", "filter"];

async function readJson(file) {
	try {
		return JSON.parse(await readFile(file, "utf8"));
	} catch (error) {
		throw new Error(`Invalid JSON in ${file}: ${error.message}`);
	}
}

async function languageKeys(file) {
	return new Set((await readFile(file, "utf8")).split(/\r?\n/).map(line => line.split("=", 1)[0]));
}

export async function validateStage3LogisticsSourceContract({ bedrockRoot = defaultBedrockRoot } = {}) {
	const behaviorRoot = resolve(bedrockRoot, "behavior_pack");
	const resourceRoot = resolve(bedrockRoot, "resource_pack");
	const [english, chinese, runtime, network] = await Promise.all([
		languageKeys(resolve(resourceRoot, "texts", "en_US.lang")),
		languageKeys(resolve(resourceRoot, "texts", "zh_CN.lang")),
		readFile(resolve(behaviorRoot, "scripts", "logistics", "depot-runtime.js"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "logistics", "depot-network.js"), "utf8")
	]);
	for (const identifier of S3_10_LOGISTICS_BLOCKS) {
		const definition = await readJson(resolve(behaviorRoot, "blocks", `${identifier}.json`));
		const block = definition["minecraft:block"];
		const fullIdentifier = `createbedrock:${identifier}`;
		if (block?.description?.identifier !== fullIdentifier)
			throw new Error(`S3-10 logistics block ${identifier} has an incorrect identifier`);
		if (!block.description.menu_category?.category)
			throw new Error(`S3-10 logistics block ${identifier} is missing creative access`);
		if (typeof block.components?.["minecraft:geometry"] !== "string"
			|| typeof block.components?.["minecraft:item_visual"]?.geometry?.identifier !== "string")
			throw new Error(`S3-10 logistics block ${identifier} is missing block or item geometry`);
		if (typeof block.components?.["minecraft:loot"] !== "string")
			throw new Error(`S3-10 logistics block ${identifier} is missing explicit loot`);
		await stat(resolve(behaviorRoot, block.components["minecraft:loot"]));
		if (!english.has(`tile.${fullIdentifier}.name`) || !chinese.has(`tile.${fullIdentifier}.name`))
			throw new Error(`S3-10 logistics block ${identifier} is missing EN/ZH translations`);
		if (!runtime.includes(fullIdentifier))
			throw new Error(`S3-10 logistics block ${identifier} is not registered by depot-runtime`);
	}
	for (const identifier of S3_10_LOGISTICS_ITEMS) {
		const definition = await readJson(resolve(behaviorRoot, "items", `${identifier}.json`));
		const item = definition["minecraft:item"];
		const fullIdentifier = `createbedrock:${identifier}`;
		if (item?.description?.identifier !== fullIdentifier || typeof item.components?.["minecraft:icon"] !== "string")
			throw new Error(`S3-10 logistics item ${identifier} is missing its identifier or icon`);
		if (!english.has(`item.${fullIdentifier}.name`) || !chinese.has(`item.${fullIdentifier}.name`))
			throw new Error(`S3-10 logistics item ${identifier} is missing EN/ZH translations`);
		if (!runtime.includes(fullIdentifier))
			throw new Error(`S3-10 logistics item ${identifier} is not registered by depot-runtime`);
	}
	for (const token of ["configurePhysicalBelt", "setFunnelFilter", "setChuteFilter", "rescanPhysicalBelts"]) {
		if (!runtime.includes(token))
			throw new Error(`S3-10 logistics runtime is missing ${token}`);
	}
	if (!network.includes("CreativeItemPort"))
		throw new Error("S3-10 logistics network is missing CreativeItemPort");
	return { blocks: S3_10_LOGISTICS_BLOCKS.length, items: S3_10_LOGISTICS_ITEMS.length };
}
