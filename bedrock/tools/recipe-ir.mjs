import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

export const RECIPE_IR_SCHEMA_VERSION = 1;

const VANILLA_RECIPE_TYPES = new Set([
	"minecraft:blasting",
	"minecraft:campfire_cooking",
	"minecraft:crafting_shaped",
	"minecraft:crafting_shapeless",
	"minecraft:smelting",
	"minecraft:smithing_transform",
	"minecraft:smoking",
	"minecraft:stonecutting"
]);

const RUNTIME_MACHINE_TYPES = new Set([
	"create:compacting",
	"create:crushing",
	"create:cutting",
	"create:haunting",
	"create:mechanical_crafting",
	"create:milling",
	"create:mixing",
	"create:pressing",
	"create:splashing"
]);

const SCRIPTED_INTERACTION_TYPES = new Set([
	"create:deploying",
	"create:emptying",
	"create:filling",
	"create:item_application",
	"create:item_copying",
	"create:sandpaper_polishing",
	"create:sequenced_assembly",
	"create:toolbox_dyeing"
]);

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function mapIdentifier(identifier) {
	if (typeof identifier !== "string" || identifier.length === 0)
		throw new TypeError("Recipe identifiers must be non-empty strings");
	return identifier.startsWith("create:")
		? `createbedrock:${identifier.slice("create:".length)}`
		: identifier;
}

function namespaceOf(identifier) {
	return typeof identifier === "string" && identifier.includes(":")
		? identifier.slice(0, identifier.indexOf(":"))
		: undefined;
}

function identifierReferences(value, references = new Set()) {
	if (Array.isArray(value)) {
		for (const entry of value)
			identifierReferences(entry, references);
		return references;
	}
	if (!value || typeof value !== "object")
		return references;
	for (const [key, entry] of Object.entries(value)) {
		if (["fluid", "id", "item", "modid", "tag", "type"].includes(key) && typeof entry === "string")
			references.add(entry);
		else
			identifierReferences(entry, references);
	}
	return references;
}

function externalNamespaces(recipe) {
	const ignored = new Set(["c", "create", "minecraft", "neoforge"]);
	return [...identifierReferences(recipe)]
		.map(namespaceOf)
		.filter(namespace => namespace && !ignored.has(namespace))
		.filter((namespace, index, namespaces) => namespaces.indexOf(namespace) === index)
		.sort((left, right) => left.localeCompare(right));
}

function normalizeIngredient(value, path, ingredients) {
	if (Array.isArray(value)) {
		value.forEach((entry, index) => normalizeIngredient(entry, `${path}[${index}]`, ingredients));
		return;
	}
	if (!value || typeof value !== "object")
		return;
	if (typeof value.item === "string") {
		ingredients.push({
			count: Number.isInteger(value.count) && value.count > 0 ? value.count : 1,
			kind: "item",
			path,
			sourceId: value.item,
			typeId: mapIdentifier(value.item)
		});
	}
	if (typeof value.tag === "string") {
		ingredients.push({
			count: Number.isInteger(value.count) && value.count > 0 ? value.count : 1,
			kind: "tag",
			path,
			tag: value.tag
		});
	}
	if (typeof value.fluid === "string") {
		ingredients.push({
			amount: Number.isInteger(value.amount) && value.amount > 0 ? value.amount : 1,
			kind: "fluid",
			path,
			sourceId: value.fluid,
			typeId: mapIdentifier(value.fluid)
		});
	}
	for (const [key, entry] of Object.entries(value)) {
		if (!["amount", "count", "fluid", "item", "tag"].includes(key))
			normalizeIngredient(entry, `${path}.${key}`, ingredients);
	}
}

function normalizeResult(value, path, results) {
	if (Array.isArray(value)) {
		value.forEach((entry, index) => normalizeResult(entry, `${path}[${index}]`, results));
		return;
	}
	if (!value || typeof value !== "object")
		return;
	if (typeof value.id === "string") {
		results.push({
			chance: Number.isFinite(value.chance) && value.chance > 0 ? value.chance : 1,
			count: Number.isInteger(value.count) && value.count > 0 ? value.count : 1,
			path,
			sourceId: value.id,
			typeId: mapIdentifier(value.id)
		});
	}
	for (const [key, entry] of Object.entries(value)) {
		if (!["chance", "count", "id"].includes(key))
			normalizeResult(entry, `${path}.${key}`, results);
	}
}

function addIngredients(source) {
	const ingredients = [];
	for (const [key, value] of Object.entries(source)) {
		if (["ingredient", "ingredients", "key", "sequence"].includes(key))
			normalizeIngredient(value, key, ingredients);
	}
	return ingredients;
}

function addResults(source) {
	const results = [];
	for (const [key, value] of Object.entries(source)) {
		if (["result", "results", "sequence"].includes(key))
			normalizeResult(value, key, results);
	}
	return results;
}

function normalizedSequence(sequence) {
	if (!Array.isArray(sequence))
		return [];
	return sequence.map((step, index) => {
		const ingredients = [];
		const results = [];
		normalizeIngredient(step?.ingredients, `sequence[${index}].ingredients`, ingredients);
		normalizeResult(step?.results, `sequence[${index}].results`, results);
		return { ingredients, results, type: step?.type };
	});
}

function classifyRecipe(source) {
	const external = externalNamespaces(source);
	if (external.length > 0) {
		return {
			compatibility: {
				decisionRef: external.map(namespace => `P7.0:compatibility/${namespace}`),
				externalNamespaces: external,
				status: "decision_required"
			},
			execution: "blocked_compatibility_decision",
			strategy: "external_compat"
		};
	}
	if (VANILLA_RECIPE_TYPES.has(source.type))
		return { execution: "pending_native_recipe", strategy: "vanilla_recipe" };
	if (RUNTIME_MACHINE_TYPES.has(source.type))
		return { execution: "pending_machine_adapter", strategy: "runtime_machine" };
	if (SCRIPTED_INTERACTION_TYPES.has(source.type))
		return { execution: "pending_interaction_adapter", strategy: "scripted_interaction" };
	throw new Error(`Recipe type ${source.type} has no P7.2 execution strategy`);
}

function normalizeRecipe(source, sourcePath) {
	if (!source || typeof source !== "object" || Array.isArray(source) || typeof source.type !== "string")
		throw new TypeError(`Java recipe ${sourcePath} is missing its type`);
	const classification = classifyRecipe(source);
	return {
		...classification,
		conditions: clone(source["neoforge:conditions"] ?? []),
		id: `create:${sourcePath}`,
		ingredients: addIngredients(source),
		processing: {
			loops: source.loops ?? 1,
			...(source.heat_requirement === undefined ? {} : { heatRequirement: source.heat_requirement }),
			...(source.processing_time === undefined ? {} : { processingTime: source.processing_time }),
			...(Array.isArray(source.sequence) ? { sequence: normalizedSequence(source.sequence) } : {})
		},
		results: addResults(source),
		source: {
			id: `create:${sourcePath}`,
			path: `src/generated/resources/data/create/recipe/${sourcePath}.json`,
			type: source.type
		},
		// Keeping the source payload is deliberate: it makes the IR lossless for
		// recipe forms that do not yet have a Bedrock runtime adapter.
		sourceRecipe: clone(source)
	};
}

async function filesUnder(directory) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const file = resolve(directory, entry.name);
		if (entry.isDirectory())
			files.push(...await filesUnder(file));
		else if (entry.name.endsWith(".json"))
			files.push(file);
	}
	return files.sort((left, right) => left.localeCompare(right));
}

export async function buildRecipeIr({ repositoryRoot }) {
	if (!repositoryRoot)
		throw new TypeError("Recipe IR generation requires a repository root");
	const sourceRoot = resolve(repositoryRoot, "src/generated/resources/data/create/recipe");
	const recipes = [];
	for (const file of await filesUnder(sourceRoot)) {
		const sourcePath = relative(sourceRoot, file).replaceAll("\\", "/").replace(/\.json$/, "");
		recipes.push(normalizeRecipe(JSON.parse(await readFile(file, "utf8")), sourcePath));
	}
	recipes.sort((left, right) => left.id.localeCompare(right.id));
	const strategies = Object.fromEntries(["external_compat", "runtime_machine", "scripted_interaction", "vanilla_recipe"]
		.map(strategy => [strategy, recipes.filter(recipe => recipe.strategy === strategy).length]));
	return {
		generatedAt: "deterministic",
		generatedFrom: "src/generated/resources/data/create/recipe",
		recipes,
		schemaVersion: RECIPE_IR_SCHEMA_VERSION,
		summary: {
			execution: Object.fromEntries([...new Set(recipes.map(recipe => recipe.execution))]
				.sort((left, right) => left.localeCompare(right))
				.map(execution => [execution, recipes.filter(recipe => recipe.execution === execution).length])),
			recipes: recipes.length,
			strategies
		}
	};
}

export function validateRecipeIr(document) {
	if (!document || typeof document !== "object" || Array.isArray(document)
		|| document.schemaVersion !== RECIPE_IR_SCHEMA_VERSION || document.generatedAt !== "deterministic"
		|| document.generatedFrom !== "src/generated/resources/data/create/recipe" || !Array.isArray(document.recipes))
		throw new TypeError("P7.2 recipe IR has an invalid header");
	const ids = new Set();
	const strategies = new Map();
	for (const recipe of document.recipes) {
		if (typeof recipe?.id !== "string" || ids.has(recipe.id) || typeof recipe.execution !== "string"
			|| !["external_compat", "runtime_machine", "scripted_interaction", "vanilla_recipe"].includes(recipe.strategy)
			|| typeof recipe.source?.id !== "string" || typeof recipe.source?.path !== "string" || typeof recipe.source?.type !== "string"
			|| !Array.isArray(recipe.ingredients) || !Array.isArray(recipe.results) || !recipe.processing || !recipe.sourceRecipe)
			throw new Error("P7.2 recipe IR contains an invalid recipe record");
		if (recipe.source.id !== recipe.id)
			throw new Error(`P7.2 recipe IR ${recipe.id} lost its Java source identity`);
		if (recipe.strategy === "external_compat" && (!Array.isArray(recipe.compatibility?.decisionRef) || recipe.compatibility.decisionRef.length === 0))
			throw new Error(`P7.2 external recipe ${recipe.id} has no P7.0 compatibility decision reference`);
		ids.add(recipe.id);
		strategies.set(recipe.strategy, (strategies.get(recipe.strategy) ?? 0) + 1);
	}
	if (document.summary?.recipes !== document.recipes.length)
		throw new Error("P7.2 recipe IR summary count is stale");
	for (const strategy of ["external_compat", "runtime_machine", "scripted_interaction", "vanilla_recipe"])
		if (document.summary?.strategies?.[strategy] !== (strategies.get(strategy) ?? 0))
			throw new Error(`P7.2 recipe IR ${strategy} summary is stale`);
	return { recipes: document.recipes.length, strategies: Object.fromEntries(strategies) };
}
