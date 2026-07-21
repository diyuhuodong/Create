import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { buildRecipeIr } from "./recipe-ir.mjs";

export const NATIVE_RECIPE_SCHEMA_VERSION = 1;
export const NATIVE_RECIPE_FORMAT_VERSION = "1.26.0";

const NATIVE_TYPES = new Set([
	"minecraft:blasting",
	"minecraft:campfire_cooking",
	"minecraft:crafting_shaped",
	"minecraft:crafting_shapeless",
	"minecraft:smelting",
	"minecraft:smithing_transform",
	"minecraft:smoking",
	"minecraft:stonecutting"
]);

// Bedrock's recipe schema accepts item tags, but the Java common-tag namespace
// is not automatically present in a Bedrock add-on. These are the canonical
// singleton projections that are exact for Create's base (non-compat) recipes.
// Multi-valued tags deliberately remain blocked until P7.1 produces item-tag
// memberships for every migrated member.
const CANONICAL_TAG_ITEMS = new Map([
	["c:barrels/wooden", "minecraft:barrel"],
	["c:chests/wooden", "minecraft:chest"],
	["c:chests/wooden/trapped", "minecraft:trapped_chest"],
	["c:cobblestones", "minecraft:cobblestone"],
	["c:dusts/redstone", "minecraft:redstone"],
	["c:eggs", "minecraft:egg"],
	["c:feathers", "minecraft:feather"],
	["c:gems/quartz", "minecraft:quartz"],
	["c:glass_blocks", "minecraft:glass"],
	["c:glass_blocks/colorless", "minecraft:glass"],
	["c:glass_panes/colorless", "minecraft:glass_pane"],
	["c:gunpowders", "minecraft:gunpowder"],
	["c:ingots/copper", "minecraft:copper_ingot"],
	["c:ingots/gold", "minecraft:gold_ingot"],
	["c:ingots/iron", "minecraft:iron_ingot"],
	["c:ingots/netherite", "minecraft:netherite_ingot"],
	["c:leathers", "minecraft:leather"],
	["c:netherracks", "minecraft:netherrack"],
	["c:nuggets/copper", "minecraft:copper_nugget"],
	["c:nuggets/iron", "minecraft:iron_nugget"],
	["c:rods/wooden", "minecraft:stick"],
	["c:sands/colorless", "minecraft:sand"],
	["c:sands/red", "minecraft:red_sand"],
	["c:slimeballs", "minecraft:slime_ball"],
	["c:strings", "minecraft:string"]
]);

function mapIdentifier(identifier) {
	if (typeof identifier !== "string" || identifier.length === 0)
		throw new TypeError("Native recipe identifiers must be non-empty strings");
	return identifier.startsWith("create:")
		? `createbedrock:${identifier.slice("create:".length)}`
		: identifier;
}

function nativeRecipeId(sourceId) {
	if (typeof sourceId !== "string" || !sourceId.startsWith("create:"))
		throw new TypeError("Native recipe source IDs must use the Create namespace");
	return `createbedrock:p7_2/${sourceId.slice("create:".length)}`;
}

function issue(kind, value) {
	return { kind, value };
}

function ingredient(value, issues, tagProjections) {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		issues.push(issue("unsupported_ingredient_shape", value));
		return undefined;
	}
	if (typeof value.item === "string")
		return { item: mapIdentifier(value.item) };
	if (typeof value.tag === "string") {
		if (value.tag.startsWith("minecraft:"))
			return { tag: value.tag };
		const canonical = CANONICAL_TAG_ITEMS.get(value.tag);
		if (canonical) {
			tagProjections.push({ canonicalItem: canonical, sourceTag: value.tag });
			return { item: canonical };
		}
		issues.push(issue("pending_tag_projection", value.tag));
		return undefined;
	}
	issues.push(issue("unsupported_ingredient_shape", value));
	return undefined;
}

function result(value, issues) {
	if (!value || typeof value !== "object" || typeof value.id !== "string") {
		issues.push(issue("unsupported_result_shape", value));
		return undefined;
	}
	const count = value.count ?? 1;
	if (!Number.isInteger(count) || count < 1) {
		issues.push(issue("unsupported_result_count", count));
		return undefined;
	}
	return count === 1 ? { item: mapIdentifier(value.id) } : { count, item: mapIdentifier(value.id) };
}

function singleItemIngredient(value, issues, tagProjections) {
	const converted = ingredient(value, issues, tagProjections);
	if (!converted)
		return undefined;
	if (typeof converted.item !== "string") {
		issues.push(issue("native_station_does_not_accept_tag", value.tag));
		return undefined;
	}
	return converted.item;
}

function cookingTags(type) {
	return new Map([
		["minecraft:blasting", ["blast_furnace"]],
		["minecraft:campfire_cooking", ["campfire"]],
		["minecraft:smelting", ["furnace"]],
		["minecraft:smoking", ["smoker"]]
	]).get(type);
}

function convertDefinition(recipe, issues, tagProjections) {
	const source = recipe.sourceRecipe;
	const description = { identifier: nativeRecipeId(recipe.id) };
	if (source.type === "minecraft:crafting_shaped") {
		if (!Array.isArray(source.pattern) || source.pattern.length === 0 || source.pattern.length > 3
			|| source.pattern.some(line => typeof line !== "string" || line.length > 3)) {
			issues.push(issue("bedrock_crafting_grid_limit", source.pattern));
			return undefined;
		}
		const key = {};
		for (const [symbol, sourceIngredient] of Object.entries(source.key ?? {})) {
			const converted = ingredient(sourceIngredient, issues, tagProjections);
			if (converted)
				key[symbol] = converted;
		}
		const convertedResult = result(source.result, issues);
		if (!convertedResult || Object.keys(key).length !== Object.keys(source.key ?? {}).length)
			return undefined;
		return {
			format_version: NATIVE_RECIPE_FORMAT_VERSION,
			"minecraft:recipe_shaped": {
				description,
				...(typeof source.group === "string" ? { group: source.group } : {}),
				tags: ["crafting_table"],
				pattern: source.pattern,
				key,
				result: convertedResult
			}
		};
	}
	if (source.type === "minecraft:crafting_shapeless" || source.type === "minecraft:stonecutting") {
		const sourceIngredients = source.type === "minecraft:stonecutting" ? [source.ingredient] : source.ingredients;
		if (!Array.isArray(sourceIngredients) || sourceIngredients.length === 0 || sourceIngredients.length > 9) {
			issues.push(issue("bedrock_shapeless_ingredient_limit", sourceIngredients));
			return undefined;
		}
		const ingredients = sourceIngredients.map(entry => ingredient(entry, issues, tagProjections));
		const convertedResult = result(source.result, issues);
		if (!convertedResult || ingredients.some(entry => !entry))
			return undefined;
		return {
			format_version: NATIVE_RECIPE_FORMAT_VERSION,
			"minecraft:recipe_shapeless": {
				description,
				...(typeof source.group === "string" ? { group: source.group } : {}),
				tags: [source.type === "minecraft:stonecutting" ? "stonecutter" : "crafting_table"],
				ingredients,
				result: convertedResult
			}
		};
	}
	if (["minecraft:blasting", "minecraft:campfire_cooking", "minecraft:smelting", "minecraft:smoking"].includes(source.type)) {
		const input = singleItemIngredient(source.ingredient, issues, tagProjections);
		const convertedResult = result(source.result, issues);
		if (!input || !convertedResult)
			return undefined;
		if (convertedResult.count !== undefined)
			issues.push(issue("native_furnace_does_not_preserve_output_count", convertedResult.count));
		if ((source.cookingtime ?? 200) !== 200)
			issues.push(issue("native_furnace_does_not_preserve_cooking_time", source.cookingtime));
		if ((source.experience ?? 0) !== 0)
			issues.push(issue("native_furnace_does_not_preserve_experience", source.experience));
		return {
			format_version: NATIVE_RECIPE_FORMAT_VERSION,
			"minecraft:recipe_furnace": {
				description,
				tags: cookingTags(source.type),
				input,
				output: convertedResult.item
			}
		};
	}
	if (source.type === "minecraft:smithing_transform") {
		const template = singleItemIngredient(source.template, issues, tagProjections);
		const base = singleItemIngredient(source.base, issues, tagProjections);
		const addition = singleItemIngredient(source.addition, issues, tagProjections);
		const convertedResult = result(source.result, issues);
		if (!template || !base || !addition || !convertedResult)
			return undefined;
		if (convertedResult.count !== undefined)
			issues.push(issue("native_smithing_does_not_preserve_output_count", convertedResult.count));
		return {
			format_version: NATIVE_RECIPE_FORMAT_VERSION,
			"minecraft:recipe_smithing_transform": {
				description,
				tags: ["smithing_table"],
				template,
				base,
				addition,
				result: convertedResult.item
			}
		};
	}
	issues.push(issue("unsupported_native_recipe_type", source.type));
	return undefined;
}

function identifiersInDefinition(value, identifiers = new Set()) {
	if (Array.isArray(value)) {
		for (const entry of value)
			identifiersInDefinition(entry, identifiers);
		return identifiers;
	}
	if (!value || typeof value !== "object")
		return identifiers;
	for (const [key, entry] of Object.entries(value)) {
		if (["addition", "base", "input", "item", "output", "result", "template"].includes(key) && typeof entry === "string")
			identifiers.add(entry);
		else
			identifiersInDefinition(entry, identifiers);
	}
	return identifiers;
}

async function definedContentIds(bedrockRoot) {
	const identifiers = new Set();
	async function scan(directory) {
		let entries;
		try {
			entries = await readdir(directory, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const file = resolve(directory, entry.name);
			if (entry.isDirectory()) {
				await scan(file);
				continue;
			}
			if (!entry.name.endsWith(".json"))
				continue;
			const json = JSON.parse(await readFile(file, "utf8"));
			const identifier = json["minecraft:item"]?.description?.identifier ?? json["minecraft:block"]?.description?.identifier;
			if (typeof identifier === "string")
				identifiers.add(identifier);
		}
	}
	await Promise.all([scan(resolve(bedrockRoot, "behavior_pack", "items")), scan(resolve(bedrockRoot, "behavior_pack", "blocks"))]);
	return identifiers;
}

function recordStatus(issues) {
	if (issues.some(entry => entry.kind === "missing_content"))
		return "blocked_missing_content";
	if (issues.some(entry => entry.kind === "pending_tag_projection"))
		return "blocked_tag_projection";
	if (issues.length > 0)
		return "blocked_platform_semantics";
	return "emittable";
}

export async function buildNativeRecipes({ bedrockRoot, repositoryRoot }) {
	if (!bedrockRoot || !repositoryRoot)
		throw new TypeError("Native recipe compilation requires Bedrock and repository roots");
	const contentIds = await definedContentIds(bedrockRoot);
	const ir = await buildRecipeIr({ repositoryRoot });
	const records = ir.recipes.filter(recipe => recipe.strategy === "vanilla_recipe").map(recipe => {
		if (!NATIVE_TYPES.has(recipe.source.type))
			throw new Error(`Recipe ${recipe.id} has an unexpected native strategy type`);
		const issues = [];
		const tagProjections = [];
		const definition = convertDefinition(recipe, issues, tagProjections);
		if (definition) {
			for (const identifier of identifiersInDefinition(definition))
				if (identifier.startsWith("createbedrock:") && !contentIds.has(identifier))
					issues.push(issue("missing_content", identifier));
		}
		return {
			...(definition ? { definition } : {}),
			id: recipe.id,
			issues,
			nativeId: nativeRecipeId(recipe.id),
			source: recipe.source,
			status: recordStatus(issues),
			tagProjections
		};
	});
	records.sort((left, right) => left.id.localeCompare(right.id));
	const statuses = ["emittable", "blocked_missing_content", "blocked_platform_semantics", "blocked_tag_projection"];
	return {
		generatedAt: "deterministic",
		generatedFrom: "src/generated/resources/data/create/recipe",
		records,
		schemaVersion: NATIVE_RECIPE_SCHEMA_VERSION,
		summary: {
			recipes: records.length,
			status: Object.fromEntries(statuses.map(status => [status, records.filter(record => record.status === status).length]))
		}
	};
}

export function renderNativeRecipeFiles(document) {
	validateNativeRecipes(document);
	return new Map(document.records
		.filter(record => record.status === "emittable" && record.definition)
		.map(record => [`${record.nativeId.slice("createbedrock:".length)}.json`, `${JSON.stringify(record.definition, null, 2)}\n`]));
}

export function validateNativeRecipes(document) {
	if (!document || typeof document !== "object" || Array.isArray(document)
		|| document.schemaVersion !== NATIVE_RECIPE_SCHEMA_VERSION || document.generatedAt !== "deterministic"
		|| document.generatedFrom !== "src/generated/resources/data/create/recipe" || !Array.isArray(document.records))
		throw new TypeError("Native recipe compilation has an invalid header");
	const sourceIds = new Set();
	const nativeIds = new Set();
	for (const record of document.records) {
		if (typeof record?.id !== "string" || sourceIds.has(record.id) || typeof record.nativeId !== "string" || nativeIds.has(record.nativeId)
			|| !NATIVE_TYPES.has(record.source?.type) || !Array.isArray(record.issues) || !Array.isArray(record.tagProjections)
			|| !["emittable", "blocked_missing_content", "blocked_platform_semantics", "blocked_tag_projection"].includes(record.status))
			throw new Error("Native recipe compilation contains an invalid record");
		if (record.status === "emittable" && !record.definition)
			throw new Error(`Emittable native recipe ${record.id} has no Bedrock definition`);
		if (record.definition && record.definition.format_version !== NATIVE_RECIPE_FORMAT_VERSION)
			throw new Error(`Native recipe ${record.id} has the wrong Bedrock format version`);
		sourceIds.add(record.id);
		nativeIds.add(record.nativeId);
	}
	if (document.summary?.recipes !== document.records.length)
		throw new Error("Native recipe compilation summary is stale");
	for (const status of ["emittable", "blocked_missing_content", "blocked_platform_semantics", "blocked_tag_projection"])
		if (document.summary.status?.[status] !== document.records.filter(record => record.status === status).length)
			throw new Error(`Native recipe compilation ${status} summary is stale`);
	return { recipes: document.records.length, status: { ...document.summary.status } };
}
