import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");

const DIRECT_RECIPE_BLOCKS = new Set([
	"cogwheel",
	"encased_chain_drive",
	"gearbox",
	"hand_crank",
	"industrial_iron_block",
	"large_cogwheel",
	"mechanical_bearing",
	"shaft",
	"track_station",
	"water_wheel",
	"zinc_block"
]);

const RUNTIME_SEMANTIC_MARKERS = new Map([
	["behavior_pack/scripts/kinetics/kinetic-runtime.js", [
		"createbedrock:belt_connector",
		"createbedrock:hand_crank",
		"createbedrock:water_wheel",
		"createbedrock:shaft",
		"createbedrock:cogwheel",
		"createbedrock:large_cogwheel",
		"createbedrock:gearbox",
		"createbedrock:encased_chain_drive",
		"connectBelt"
	]],
	["behavior_pack/scripts/contraptions/contraption-runtime.js", [
		"createbedrock:mechanical_bearing",
		"DynamicAssemblyController",
		"normalizeContraptionSnapshot"
	]],
	["behavior_pack/scripts/trains/train-runtime.js", [
		"createbedrock:track",
		"createbedrock:track_station",
		"TrackGraph",
		"TrainController",
		"ShardedStateStore"
	]]
]);

const STRUCTURAL_CONTENT_BLOCKS = new Set([
	"createbedrock:andesite_casing",
	"createbedrock:brass_casing",
	"createbedrock:copper_casing",
	"createbedrock:industrial_iron_block",
	"createbedrock:zinc_block"
]);

async function readJson(file) {
	try {
		return JSON.parse(await readFile(file, "utf8"));
	} catch (error) {
		throw new Error(`Invalid JSON in ${file}: ${error.message}`);
	}
}

async function languageKeys(file) {
	const text = await readFile(file, "utf8");
	return new Set(text.split(/\r?\n/).map(line => line.split("=", 1)[0]));
}

function recipeResult(recipe) {
	const definition = Object.values(recipe).find(value => value?.description?.identifier);
	return definition?.result?.item;
}

export async function validateStage2FoundationContract({ bedrockRoot = defaultBedrockRoot } = {}) {
	const matrix = await readJson(resolve(bedrockRoot, "data", "migration-matrix.json"));
	const phaseEntries = matrix.entries.filter(entry => entry.phase === 2);
	if (phaseEntries.length !== 22)
		throw new Error(`Stage-2 foundation contract expects 22 entries, found ${phaseEntries.length}`);
	if (phaseEntries.some(entry => entry.status !== "static_verified"))
		throw new Error("Every Stage-2 foundation entry must be static_verified before closure");

	const [english, chinese] = await Promise.all([
		languageKeys(resolve(bedrockRoot, "resource_pack", "texts", "en_US.lang")),
		languageKeys(resolve(bedrockRoot, "resource_pack", "texts", "zh_CN.lang"))
	]);
	const behaviorSources = new Map();
	for (const entry of phaseEntries) {
		if (!entry.behaviorPath)
			continue;
		if (!behaviorSources.has(entry.behaviorPath)) {
			const sources = [await readFile(resolve(bedrockRoot, entry.behaviorPath), "utf8")];
			if (entry.behaviorPath === "behavior_pack/scripts/kinetics/kinetic-runtime.js")
				sources.push(await readFile(resolve(bedrockRoot, "behavior_pack", "scripts", "kinetics", "kinetic-world.js"), "utf8"));
			behaviorSources.set(entry.behaviorPath, sources.join("\n"));
		}
		if (!behaviorSources.get(entry.behaviorPath).includes(entry.bedrockIdentifier))
			throw new Error(`Stage-2 runtime ${entry.behaviorPath} does not bind ${entry.bedrockIdentifier}`);
	}
	for (const [behaviorPath, markers] of RUNTIME_SEMANTIC_MARKERS) {
		const source = behaviorSources.get(behaviorPath);
		if (!source)
			throw new Error(`Stage-2 runtime contract is missing ${behaviorPath}`);
		for (const marker of markers)
			if (!source.includes(marker))
				throw new Error(`Stage-2 runtime ${behaviorPath} is missing semantic marker ${marker}`);
	}

	const blocks = new Map();
	for (const entry of phaseEntries.filter(entry => entry.kind === "block"))
		blocks.set(entry.bedrockIdentifier, entry);
	for (const [identifier] of blocks) {
		const name = identifier.slice("createbedrock:".length);
		const block = (await readJson(resolve(bedrockRoot, "behavior_pack", "blocks", `${name}.json`)))["minecraft:block"];
		if (block?.description?.identifier !== identifier)
			throw new Error(`Stage-2 block ${identifier} has an incorrect identifier`);
		if (!block.description.menu_category?.category)
			throw new Error(`Stage-2 block ${identifier} is missing creative access`);
		if (typeof block.components?.["minecraft:geometry"] !== "string"
			|| typeof block.components?.["minecraft:item_visual"]?.geometry?.identifier !== "string")
			throw new Error(`Stage-2 block ${identifier} is missing a block or item geometry`);
		const lootPath = block.components?.["minecraft:loot"];
		if (typeof lootPath !== "string")
			throw new Error(`Stage-2 block ${identifier} is missing explicit loot`);
		const loot = await readJson(resolve(bedrockRoot, "behavior_pack", lootPath));
		if (loot.pools?.[0]?.entries?.[0]?.name !== identifier)
			throw new Error(`Stage-2 block ${identifier} does not self-drop`);
		if (!english.has(`tile.${identifier}.name`) || !chinese.has(`tile.${identifier}.name`))
			throw new Error(`Stage-2 block ${identifier} is missing a translation`);
		if (DIRECT_RECIPE_BLOCKS.has(name)) {
			const recipe = await readJson(resolve(bedrockRoot, "behavior_pack", "recipes", `${name}.json`));
			if (recipeResult(recipe) !== identifier)
				throw new Error(`Stage-2 recipe ${name} does not produce ${identifier}`);
		}
	}

	const belt = phaseEntries.find(entry => entry.kind === "item" && entry.bedrockIdentifier === "createbedrock:belt_connector");
	if (!belt)
		throw new Error("Stage-2 belt connector item is missing from the migration matrix");
	const beltItem = (await readJson(resolve(bedrockRoot, "behavior_pack", "items", "belt_connector.json")))["minecraft:item"];
	if (beltItem?.description?.identifier !== belt.bedrockIdentifier || !beltItem.description.menu_category?.category || typeof beltItem.components?.["minecraft:icon"] !== "string")
		throw new Error("Stage-2 belt connector is missing a usable item definition");
	if (!english.has(`item.${belt.bedrockIdentifier}.name`) || !chinese.has(`item.${belt.bedrockIdentifier}.name`))
		throw new Error("Stage-2 belt connector is missing a translation");

	for (const entry of phaseEntries.filter(entry => entry.kind === "block_entity"))
		await stat(resolve(bedrockRoot, entry.behaviorPath));

	const [movableBlocks, contraptionParts] = await Promise.all([
		readFile(resolve(bedrockRoot, "behavior_pack", "scripts", "contraptions", "movable-blocks.js"), "utf8"),
		readFile(resolve(bedrockRoot, "behavior_pack", "scripts", "contraptions", "contraption-parts.js"), "utf8")
	]);
	for (const identifier of STRUCTURAL_CONTENT_BLOCKS) {
		if (!movableBlocks.includes(identifier) || !contraptionParts.includes(identifier))
			throw new Error(`Stage-2 structural block ${identifier} is not safe to carry in the bounded bearing assembly`);
	}

	return {
		blocks: blocks.size,
		directRecipes: DIRECT_RECIPE_BLOCKS.size,
		entries: phaseEntries.length,
		runtimeBindings: behaviorSources.size,
		semanticRuntimeContracts: RUNTIME_SEMANTIC_MARKERS.size,
		structuralContentBlocks: STRUCTURAL_CONTENT_BLOCKS.size
	};
}
