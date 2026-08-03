import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");

const ORE_VARIANTS = [
	{
		block: "createbedrock:zinc_ore",
		feature: "zinc_ore",
		range: [-48, 96]
	},
	{
		block: "createbedrock:deepslate_zinc_ore",
		feature: "deepslate_zinc_ore",
		range: [-56, 0]
	}
];

async function readJson(file) {
	try {
		return JSON.parse(await readFile(file, "utf8"));
	} catch (error) {
		throw new Error(`Invalid JSON in ${file}: ${error.message}`);
	}
}

function hasId(ingredients, identifier) {
	return Object.values(ingredients ?? {}).some(ingredient => ingredient?.item === identifier);
}

function assertOreFeature(document, variant) {
	const feature = document["minecraft:ore_feature"];
	if (document.format_version !== "1.20.30" || feature?.description?.identifier !== `createbedrock:${variant.feature}_vein`
		|| feature.count !== 8 || feature.discard_chance_on_air_exposure !== 0.15)
		throw new Error(`C0 ore feature ${variant.feature} must retain its documented vein definition`);
	const rule = feature.replace_rules?.find(candidate => candidate?.places_block === variant.block);
	if (!rule || !Array.isArray(rule.may_replace) || rule.may_replace.length === 0)
		throw new Error(`C0 ore feature ${variant.feature} must only replace an explicit host-block set`);
}

function assertScatterFeature(document, variant) {
	const scatter = document["minecraft:scatter_feature"];
	if (document.format_version !== "1.20.30" || scatter?.description?.identifier !== `createbedrock:${variant.feature}_scatter`
		|| scatter.places_feature !== `createbedrock:${variant.feature}_vein` || scatter.iterations !== 8
		|| JSON.stringify(scatter.y?.extent) !== JSON.stringify(variant.range))
		throw new Error(`C0 ore scatter ${variant.feature} must retain its bounded underground distribution`);
}

function assertFeatureRule(document, variant) {
	const rule = document["minecraft:feature_rules"];
	const filters = rule?.conditions?.["minecraft:biome_filter"]?.all_of;
	if (document.format_version !== "1.20.30" || rule?.description?.identifier !== `createbedrock:${variant.feature}_underground`
		|| rule.description.places_feature !== `createbedrock:${variant.feature}_scatter`
		|| rule.conditions?.placement_pass !== "underground_pass" || rule.distribution?.iterations !== 1
		|| !Array.isArray(filters) || !filters.some(filter => filter?.test === "has_biome_tag" && filter.operator === "!=" && filter.value === "nether")
		|| !filters.some(filter => filter?.test === "has_biome_tag" && filter.operator === "!=" && filter.value === "the_end"))
		throw new Error(`C0 ore rule ${variant.feature} must attach only to non-Nether, non-End underground generation`);
}

/**
 * C0 makes the initial material chain available in survival worlds: generated
 * ore drops raw zinc, furnace processing creates zinc ingots, and the existing
 * block recipes consume those actual Bedrock items.
 */
export async function validateContentMaterialFoundation({ bedrockRoot = defaultBedrockRoot } = {}) {
	const behaviorRoot = resolve(bedrockRoot, "behavior_pack");
	for (const variant of ORE_VARIANTS) {
		const [feature, rule, scatter, block, loot] = await Promise.all([
			readJson(resolve(behaviorRoot, "features", `${variant.feature}_vein.json`)),
			readJson(resolve(behaviorRoot, "feature_rules", `${variant.feature}_underground.json`)),
			readJson(resolve(behaviorRoot, "features", `${variant.feature}_scatter.json`)),
			readJson(resolve(behaviorRoot, "blocks", `${variant.feature}.json`)),
			readJson(resolve(behaviorRoot, "loot_tables", "blocks", `${variant.feature}.json`))
		]);
		assertOreFeature(feature, variant);
		assertScatterFeature(scatter, variant);
		assertFeatureRule(rule, variant);
		if (block["minecraft:block"]?.description?.identifier !== variant.block
			|| block["minecraft:block"]?.components?.["minecraft:loot"] !== `loot_tables/blocks/${variant.feature}.json`
			|| loot.pools?.[0]?.entries?.[0]?.name !== "createbedrock:raw_zinc")
			throw new Error(`C0 ore ${variant.feature} must drop the raw-zinc foundation item`);
	}
	const [rawZinc, zincIngot, zincRecipe, zincBlockRecipe] = await Promise.all([
		readJson(resolve(behaviorRoot, "items", "raw_zinc.json")),
		readJson(resolve(behaviorRoot, "items", "zinc_ingot.json")),
		readJson(resolve(behaviorRoot, "recipes", "zinc_ingot_from_raw_zinc.json")),
		readJson(resolve(behaviorRoot, "recipes", "zinc_block.json"))
	]);
	if (rawZinc["minecraft:item"]?.description?.identifier !== "createbedrock:raw_zinc"
		|| zincIngot["minecraft:item"]?.description?.identifier !== "createbedrock:zinc_ingot"
		|| zincRecipe["minecraft:recipe_furnace"]?.input !== "createbedrock:raw_zinc"
		|| zincRecipe["minecraft:recipe_furnace"]?.output !== "createbedrock:zinc_ingot"
		|| zincBlockRecipe["minecraft:recipe_shaped"]?.result?.item !== "createbedrock:zinc_block"
		|| !hasId(zincBlockRecipe["minecraft:recipe_shaped"]?.key, "createbedrock:zinc_ingot"))
		throw new Error("C0 zinc material chain must retain ore, furnace, and storage-block acquisition");
	return { oreFeatures: ORE_VARIANTS.length, oreRules: ORE_VARIANTS.length, materialItems: 2 };
}
