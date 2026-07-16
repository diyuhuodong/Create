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

export const S3_10_DIRECT_RECIPE_RESOURCES = [
	"andesite_belt_funnel",
	"andesite_tunnel",
	"attribute_filter",
	"belt",
	"brass_belt_funnel",
	"brass_funnel",
	"brass_tunnel",
	"chute",
	"depot",
	"filter",
	"item_hatch",
	"item_vault",
	"smart_chute",
	"weighted_ejector"
];

const S3_10_CREATIVE_ONLY_BLOCKS = new Set(["creative_crate"]);
const S3_10_RUNTIME_PATH = "behavior_pack/scripts/logistics/depot-runtime.js";
const S3_10_RUNTIME_BOUNDARIES = [
	{
		path: "scripts/logistics/depot-runtime.js",
		markers: ["configurePhysicalBelt", "rescanPhysicalBelts", "configureFilter", "registerManagedLogisticsPort", "Cannot remove a belt with an active transport"]
	},
	{
		path: "scripts/logistics/depot-network.js",
		markers: ["#tickBelt()", "#tickBeltTransport", "#launchBeltTransport", "releaseExternalManagedDepot", "restore()"]
	},
	{
		path: "scripts/logistics/item-transfer-journal.js",
		markers: ["transferPartition", "hasSource", "destination_full", "restore(records)"]
	},
	{
		path: "scripts/logistics/item-filter.js",
		markers: ["class ItemFilter", "selectItemFilter", "resolveTag"]
	}
];

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

async function recipeIngredientsAreDeclared(recipe, bedrockRoot) {
	const definition = recipe["minecraft:recipe_shaped"] ?? recipe["minecraft:recipe_shapeless"];
	const ingredients = definition?.ingredients ?? Object.values(definition?.key ?? {});
	if (!Array.isArray(ingredients) || ingredients.length === 0)
		return false;
	for (const ingredient of ingredients) {
		const item = ingredient?.item;
		if (typeof item !== "string" || !item.startsWith("createbedrock:"))
			continue;
		const name = item.slice("createbedrock:".length);
		const candidates = [
			resolve(bedrockRoot, "behavior_pack", "blocks", `${name}.json`),
			resolve(bedrockRoot, "behavior_pack", "items", `${name}.json`)
		];
		let declared = false;
		for (const candidate of candidates) {
			try {
				declared = (await stat(candidate)).isFile();
			} catch {
				// Check both block and item declarations before rejecting an ingredient.
			}
			if (declared)
				break;
		}
		if (!declared)
			throw new Error(`S3-10 recipe references an undeclared custom ingredient ${item}`);
	}
	return true;
}

async function validateStaticDeliveryState(trackingRoot) {
	const [matrix, workQueue] = await Promise.all([
		readJson(resolve(trackingRoot, "data", "migration-matrix.json")),
		readJson(resolve(trackingRoot, "data", "stage3-work-queue.json"))
	]);
	const matrixEntries = new Map(matrix.entries.map(entry => [entry.acceptanceId, entry]));
	const queued = workQueue.entries.filter(entry => entry.deliveryPackage === "completed:S3-10");
	if (queued.length !== 26)
		throw new Error(`S3-10 must close 26 logistics records, found ${queued.length}`);
	let runtimeAbsorbed = 0;
	for (const entry of queued) {
		const matrixEntry = matrixEntries.get(entry.acceptanceId);
		if (!matrixEntry || entry.matrixStatus !== "static_verified" || matrixEntry.status !== "static_verified")
			throw new Error(`S3-10 queue entry ${entry.acceptanceId} is not statically verified`);
		if (matrixEntry.persistenceSchema !== 2 || matrixEntry.behaviorPath !== S3_10_RUNTIME_PATH)
			throw new Error(`S3-10 queue entry ${entry.acceptanceId} is not owned by the durable DepotNetwork boundary`);
		if (entry.kind === "block_entity")
			runtimeAbsorbed++;
	}
	if (runtimeAbsorbed !== 11)
		throw new Error(`S3-10 must absorb 11 Java block entities, found ${runtimeAbsorbed}`);
	return { runtimeAbsorbed, staticRecords: queued.length };
}

export async function validateStage3LogisticsSourceContract({
	bedrockRoot = defaultBedrockRoot,
	trackingRoot = defaultBedrockRoot
} = {}) {
	const behaviorRoot = resolve(bedrockRoot, "behavior_pack");
	const resourceRoot = resolve(bedrockRoot, "resource_pack");
	const [english, chinese] = await Promise.all([
		languageKeys(resolve(resourceRoot, "texts", "en_US.lang")),
		languageKeys(resolve(resourceRoot, "texts", "zh_CN.lang"))
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
	}
	for (const identifier of S3_10_LOGISTICS_ITEMS) {
		const definition = await readJson(resolve(behaviorRoot, "items", `${identifier}.json`));
		const item = definition["minecraft:item"];
		const fullIdentifier = `createbedrock:${identifier}`;
		if (item?.description?.identifier !== fullIdentifier || typeof item.components?.["minecraft:icon"] !== "string")
			throw new Error(`S3-10 logistics item ${identifier} is missing its identifier or icon`);
		if (!english.has(`item.${fullIdentifier}.name`) || !chinese.has(`item.${fullIdentifier}.name`))
			throw new Error(`S3-10 logistics item ${identifier} is missing EN/ZH translations`);
	}
	for (const identifier of S3_10_DIRECT_RECIPE_RESOURCES) {
		const recipe = await readJson(resolve(behaviorRoot, "recipes", `${identifier}.json`));
		const definition = recipe["minecraft:recipe_shaped"] ?? recipe["minecraft:recipe_shapeless"];
		if (definition?.result?.item !== `createbedrock:${identifier}`)
			throw new Error(`S3-10 logistics resource ${identifier} is missing a direct crafting result`);
		if (!await recipeIngredientsAreDeclared(recipe, bedrockRoot))
			throw new Error(`S3-10 logistics resource ${identifier} is missing declared recipe ingredients`);
	}
	for (const identifier of S3_10_CREATIVE_ONLY_BLOCKS) {
		if (!S3_10_LOGISTICS_BLOCKS.includes(identifier))
			throw new Error(`S3-10 creative-only block ${identifier} is not a delivered logistics block`);
	}
	for (const boundary of S3_10_RUNTIME_BOUNDARIES) {
		const source = await readFile(resolve(behaviorRoot, boundary.path), "utf8");
		for (const marker of boundary.markers) {
			if (!source.includes(marker))
				throw new Error(`S3-10 logistics runtime ${boundary.path} is missing ${marker}`);
		}
	}
	const state = await validateStaticDeliveryState(trackingRoot);
	return {
		blocks: S3_10_LOGISTICS_BLOCKS.length,
		creativeOnly: S3_10_CREATIVE_ONLY_BLOCKS.size,
		directRecipes: S3_10_DIRECT_RECIPE_RESOURCES.length,
		items: S3_10_LOGISTICS_ITEMS.length,
		runtimeAbsorbed: state.runtimeAbsorbed,
		runtimeBoundaries: S3_10_RUNTIME_BOUNDARIES.length,
		staticRecords: state.staticRecords
	};
}
