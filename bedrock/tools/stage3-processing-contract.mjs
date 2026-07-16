import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");

export const S3_11_PROCESSING_BLOCKS = ["basin", "encased_fan", "mechanical_mixer", "mechanical_saw"];
export const S3_11_DIRECT_RECIPE_BLOCKS = [...S3_11_PROCESSING_BLOCKS];

const KINETIC_PROCESSORS = new Set(["encased_fan", "mechanical_mixer", "mechanical_saw"]);
const REPORTS = ["basin", "cutting", "fan"];
const S3_11_RUNTIME_PATH = "behavior_pack/scripts/processing/stage3-processing-runtime.js";
const S3_11_RUNTIME_BOUNDARIES = [
	{
		path: "scripts/processing/stage3-processing-runtime.js",
		markers: ["BatchProcessingMachine", "basinController", "fanMode", "createShardedMachineState", "Cannot remove this processing machine"]
	},
	{
		path: "scripts/processing/batch-processing-machine.js",
		markers: ["seededRandom", "#startBufferedInput", "#deliverPendingOutput", "restore(snapshot)"]
	},
	{
		path: "scripts/processing/sharded-machine-state.js",
		markers: ["createShardedMachineState", "request(records)", "diagnostics()"]
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
				// Check both Bedrock declaration kinds before rejecting an ingredient.
			}
			if (declared)
				break;
		}
		if (!declared)
			throw new Error(`S3-11 recipe references an undeclared custom ingredient ${item}`);
	}
	return true;
}

async function validateRecipeReports(dataRoot) {
	for (const processor of REPORTS) {
		const [report, recipes] = await Promise.all([
			readJson(resolve(dataRoot, "data", "recipes", `${processor}-import-report.json`)),
			readJson(resolve(dataRoot, "data", "recipes", `${processor}.json`))
		]);
		if (report.processor !== processor || !Array.isArray(report.records) || report.records.length === 0)
			throw new Error(`S3-11 ${processor} recipe report is incomplete`);
		if (!Array.isArray(recipes) || recipes.length === 0)
			throw new Error(`S3-11 ${processor} recipe mapping is empty`);
		const recipeIds = new Set(recipes.map(recipe => recipe.id));
		for (const record of report.records) {
			if (!['manual_specification', 'migrated', 'unsupported_dependency'].includes(record.status))
				throw new Error(`S3-11 ${processor} recipe report has an unknown classification`);
			if (record.status === "migrated") {
				if (!Array.isArray(record.recipeIds) || record.recipeIds.length === 0 || record.recipeIds.some(id => !recipeIds.has(id)))
					throw new Error(`S3-11 ${processor} migrated recipe report does not map every generated recipe`);
			} else if (typeof record.reason !== "string" || record.reason.length === 0)
				throw new Error(`S3-11 ${processor} non-migrated recipe lacks an explicit boundary`);
		}
	}
}

async function validateStaticDeliveryState(dataRoot) {
	const [matrix, workQueue] = await Promise.all([
		readJson(resolve(dataRoot, "data", "migration-matrix.json")),
		readJson(resolve(dataRoot, "data", "stage3-work-queue.json"))
	]);
	const matrixEntries = new Map(matrix.entries.map(entry => [entry.acceptanceId, entry]));
	const queued = workQueue.entries.filter(entry => entry.deliveryPackage === "completed:S3-11");
	if (queued.length !== 8)
		throw new Error(`S3-11 must close 8 processing records, found ${queued.length}`);
	let runtimeAbsorbed = 0;
	for (const entry of queued) {
		const matrixEntry = matrixEntries.get(entry.acceptanceId);
		if (!matrixEntry || entry.matrixStatus !== "static_verified" || matrixEntry.status !== "static_verified")
			throw new Error(`S3-11 queue entry ${entry.acceptanceId} is not statically verified`);
		if (matrixEntry.persistenceSchema !== 2 || matrixEntry.behaviorPath !== S3_11_RUNTIME_PATH)
			throw new Error(`S3-11 queue entry ${entry.acceptanceId} is not owned by the durable BatchProcessingMachine boundary`);
		if (entry.kind === "block_entity")
			runtimeAbsorbed++;
	}
	if (runtimeAbsorbed !== 4)
		throw new Error(`S3-11 must absorb 4 Java block entities, found ${runtimeAbsorbed}`);
	return { runtimeAbsorbed, staticRecords: queued.length };
}

export async function validateStage3ProcessingSourceContract({
	bedrockRoot = defaultBedrockRoot,
	dataRoot = defaultBedrockRoot
} = {}) {
	const behaviorRoot = resolve(bedrockRoot, "behavior_pack");
	const resourceRoot = resolve(bedrockRoot, "resource_pack");
	const [english, chinese, kinetics] = await Promise.all([
		languageKeys(resolve(resourceRoot, "texts", "en_US.lang")),
		languageKeys(resolve(resourceRoot, "texts", "zh_CN.lang")),
		readFile(resolve(behaviorRoot, "scripts", "kinetics", "kinetic-world.js"), "utf8")
	]);
	for (const identifier of S3_11_PROCESSING_BLOCKS) {
		const definition = await readJson(resolve(behaviorRoot, "blocks", `${identifier}.json`));
		const block = definition["minecraft:block"];
		const fullIdentifier = `createbedrock:${identifier}`;
		if (block?.description?.identifier !== fullIdentifier)
			throw new Error(`S3-11 processing block ${identifier} has an incorrect identifier`);
		if (!block.description.menu_category?.category)
			throw new Error(`S3-11 processing block ${identifier} is missing creative access`);
		if (typeof block.components?.["minecraft:geometry"] !== "string"
			|| typeof block.components?.["minecraft:item_visual"]?.geometry?.identifier !== "string")
			throw new Error(`S3-11 processing block ${identifier} is missing a block or item geometry`);
		if (typeof block.components?.["minecraft:loot"] !== "string")
			throw new Error(`S3-11 processing block ${identifier} is missing explicit loot`);
		await stat(resolve(behaviorRoot, block.components["minecraft:loot"]));
		if (!english.has(`tile.${fullIdentifier}.name`) || !chinese.has(`tile.${fullIdentifier}.name`))
			throw new Error(`S3-11 processing block ${identifier} is missing EN/ZH translations`);
		if (KINETIC_PROCESSORS.has(identifier) && !kinetics.includes(fullIdentifier))
			throw new Error(`S3-11 processing block ${identifier} is missing KineticWorld registration`);
	}
	for (const identifier of S3_11_DIRECT_RECIPE_BLOCKS) {
		const recipe = await readJson(resolve(behaviorRoot, "recipes", `${identifier}.json`));
		const definition = recipe["minecraft:recipe_shaped"] ?? recipe["minecraft:recipe_shapeless"];
		if (definition?.result?.item !== `createbedrock:${identifier}`)
			throw new Error(`S3-11 processing block ${identifier} is missing a direct crafting result`);
		if (!await recipeIngredientsAreDeclared(recipe, bedrockRoot))
			throw new Error(`S3-11 processing block ${identifier} is missing declared recipe ingredients`);
	}
	for (const boundary of S3_11_RUNTIME_BOUNDARIES) {
		const source = await readFile(resolve(behaviorRoot, boundary.path), "utf8");
		for (const marker of boundary.markers) {
			if (!source.includes(marker))
				throw new Error(`S3-11 processing runtime ${boundary.path} is missing ${marker}`);
		}
	}
	await validateRecipeReports(dataRoot);
	const state = await validateStaticDeliveryState(dataRoot);
	return {
		blocks: S3_11_PROCESSING_BLOCKS.length,
		directRecipes: S3_11_DIRECT_RECIPE_BLOCKS.length,
		reports: REPORTS.length,
		runtimeAbsorbed: state.runtimeAbsorbed,
		runtimeBoundaries: S3_11_RUNTIME_BOUNDARIES.length,
		staticRecords: state.staticRecords
	};
}
