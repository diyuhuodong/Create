import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");

export const S3_12_FLUID_BLOCKS = [
	"copper_valve_handle",
	"creative_fluid_tank",
	"encased_fluid_pipe",
	"fluid_valve",
	"glass_fluid_pipe",
	"item_drain",
	"portable_fluid_interface",
	"smart_fluid_pipe",
	"spout"
];
export const S3_12_DIRECT_RECIPE_BLOCKS = S3_12_FLUID_BLOCKS.filter(identifier => identifier !== "creative_fluid_tank");

const S3_12_RUNTIME_PATH = "behavior_pack/scripts/fluids/fluid-runtime.js";
const S3_12_RUNTIME_BOUNDARIES = [
	{
		path: "scripts/fluids/fluid-runtime.js",
		markers: ["FLUID_ENDPOINT_CAPACITIES", "syncPipeConfiguration", "toggleValve", "allowedDirection", "state.restore()"]
	},
	{
		path: "scripts/fluids/fluid-network.js",
		markers: ["FluidTransferJournal", "predicate: link.filter", "source_busy", "roundRobinAfter", "restore(snapshot)"]
	},
	{
		path: "scripts/fluids/fluid-network-state.js",
		markers: ["ShardedStateStore", "updateExternalPortDescriptor", "external_escrow_retirement", "#persist()"]
	},
	{
		path: "scripts/fluids/fluid-tank.js",
		markers: ["capacity", "reserve(", "fluidStackFingerprint", "restore(snapshot)"]
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

function recipeUsesVanillaSurvivalIngredients(recipe) {
	const definition = recipe["minecraft:recipe_shaped"] ?? recipe["minecraft:recipe_shapeless"];
	const ingredients = definition?.ingredients ?? Object.values(definition?.key ?? {});
	if (!Array.isArray(ingredients) || ingredients.length === 0)
		return false;
	for (const ingredient of ingredients) {
		const item = ingredient?.item;
		if (typeof item !== "string" || !item.startsWith("minecraft:"))
			throw new Error(`S3-12 direct recipe requires a vanilla survival ingredient, found ${item}`);
	}
	return true;
}

async function validateStaticDeliveryState(trackingRoot) {
	const [matrix, workQueue] = await Promise.all([
		readJson(resolve(trackingRoot, "data", "migration-matrix.json")),
		readJson(resolve(trackingRoot, "data", "stage3-work-queue.json"))
	]);
	const matrixEntries = new Map(matrix.entries.map(entry => [entry.acceptanceId, entry]));
	const queued = workQueue.entries.filter(entry => entry.deliveryPackage === "completed:S3-12");
	if (queued.length !== 18)
		throw new Error(`S3-12 must close 18 fluid records, found ${queued.length}`);
	let runtimeAbsorbed = 0;
	for (const entry of queued) {
		const matrixEntry = matrixEntries.get(entry.acceptanceId);
		if (!matrixEntry || entry.matrixStatus !== "static_verified" || matrixEntry.status !== "static_verified")
			throw new Error(`S3-12 queue entry ${entry.acceptanceId} is not statically verified`);
		if (matrixEntry.persistenceSchema !== 2 || matrixEntry.behaviorPath !== S3_12_RUNTIME_PATH)
			throw new Error(`S3-12 queue entry ${entry.acceptanceId} is not owned by the durable fluid runtime`);
		if (entry.kind === "block_entity")
			runtimeAbsorbed++;
	}
	if (runtimeAbsorbed !== 9)
		throw new Error(`S3-12 must absorb 9 Java block entities, found ${runtimeAbsorbed}`);
	return { runtimeAbsorbed, staticRecords: queued.length };
}

export async function validateStage3FluidSourceContract({
	bedrockRoot = defaultBedrockRoot,
	trackingRoot = defaultBedrockRoot
} = {}) {
	const behaviorRoot = resolve(bedrockRoot, "behavior_pack");
	const resourceRoot = resolve(bedrockRoot, "resource_pack");
	const [english, chinese, runtime] = await Promise.all([
		languageKeys(resolve(resourceRoot, "texts", "en_US.lang")),
		languageKeys(resolve(resourceRoot, "texts", "zh_CN.lang")),
		readFile(resolve(behaviorRoot, "scripts", "fluids", "fluid-runtime.js"), "utf8")
	]);
	for (const identifier of S3_12_FLUID_BLOCKS) {
		const definition = await readJson(resolve(behaviorRoot, "blocks", `${identifier}.json`));
		const block = definition["minecraft:block"];
		const fullIdentifier = `createbedrock:${identifier}`;
		if (block?.description?.identifier !== fullIdentifier)
			throw new Error(`S3-12 fluid block ${identifier} has an incorrect identifier`);
		if (!block.description.menu_category?.category)
			throw new Error(`S3-12 fluid block ${identifier} is missing creative access`);
		if (typeof block.components?.["minecraft:geometry"] !== "string"
			|| typeof block.components?.["minecraft:item_visual"]?.geometry?.identifier !== "string")
			throw new Error(`S3-12 fluid block ${identifier} is missing a block or item geometry`);
		if (typeof block.components?.["minecraft:loot"] !== "string")
			throw new Error(`S3-12 fluid block ${identifier} is missing explicit loot`);
		await stat(resolve(behaviorRoot, block.components["minecraft:loot"]));
		if (!english.has(`tile.${fullIdentifier}.name`) || !chinese.has(`tile.${fullIdentifier}.name`))
			throw new Error(`S3-12 fluid block ${identifier} is missing EN/ZH translations`);
		if (!runtime.includes(fullIdentifier))
			throw new Error(`S3-12 fluid block ${identifier} is not registered by the fluid runtime`);
	}
	for (const identifier of S3_12_DIRECT_RECIPE_BLOCKS) {
		const recipe = await readJson(resolve(behaviorRoot, "recipes", `${identifier}.json`));
		const definition = recipe["minecraft:recipe_shaped"] ?? recipe["minecraft:recipe_shapeless"];
		if (definition?.result?.item !== `createbedrock:${identifier}`)
			throw new Error(`S3-12 fluid block ${identifier} is missing a direct crafting result`);
		if (!recipeUsesVanillaSurvivalIngredients(recipe))
			throw new Error(`S3-12 fluid block ${identifier} is missing vanilla survival ingredients`);
	}
	for (const boundary of S3_12_RUNTIME_BOUNDARIES) {
		const source = await readFile(resolve(behaviorRoot, boundary.path), "utf8");
		for (const marker of boundary.markers) {
			if (!source.includes(marker))
				throw new Error(`S3-12 fluid runtime ${boundary.path} is missing ${marker}`);
		}
	}
	const state = await validateStaticDeliveryState(trackingRoot);
	return {
		blocks: S3_12_FLUID_BLOCKS.length,
		directRecipes: S3_12_DIRECT_RECIPE_BLOCKS.length,
		runtimeAbsorbed: state.runtimeAbsorbed,
		runtimeBoundaries: S3_12_RUNTIME_BOUNDARIES.length,
		staticRecords: state.staticRecords
	};
}
