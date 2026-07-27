import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const P73_RECIPE_EXECUTION_LEDGER_SCHEMA_VERSION = 1;

const DATA_FILES = [
	"recipes/recipe-ir.json",
	"recipes/native.json",
	"recipes/interactions.json",
	"recipes/mechanical-crafting.json",
	"recipes/sequenced-assembly.json",
	"recipes/milling.json",
	"recipes/crushing.json",
	"recipes/pressing.json",
	"recipes/basin.json",
	"recipes/fan.json",
	"recipes/cutting.json",
	"recipes/crushing-import-report.json",
	"p7-7-cooking-parity.json"
];

function exactJson(left, right) {
	return JSON.stringify(left) === JSON.stringify(right);
}

function assertString(value, label) {
	if (typeof value !== "string" || value.length === 0)
		throw new TypeError(`P7.3 recipe execution ledger ${label} must be a non-empty string`);
}

function withoutGeneratedIndex(identifier) {
	return identifier.replace(/:[0-9]+$/, "");
}

function outputRecordMatches(record, sourceId) {
	const sourcePath = sourceId.slice("create:".length);
	const identifier = withoutGeneratedIndex(record.id);
	return identifier === sourceId
		|| record.id.startsWith(`${sourceId}:`)
		|| record.source === sourcePath
		|| (identifier.startsWith("create:basin/") && identifier.slice("create:basin/".length) === sourcePath)
		|| (identifier.startsWith("create:fan/") && identifier.slice("create:fan/".length) === sourcePath)
		|| (identifier.startsWith("create:cutting/") && identifier.slice("create:cutting/".length) === sourcePath);
}

function summary(entries) {
	return Object.fromEntries([...new Set(entries.map(entry => entry.execution))].sort()
		.map(execution => [execution, entries.filter(entry => entry.execution === execution).length]));
}

function staticCovered(entries) {
	return entries.filter(entry => !["external_compatibility", "runtime_adapter_pending"].includes(entry.execution)).length;
}

async function readJson(bedrockRoot, name) {
	return JSON.parse(await readFile(resolve(bedrockRoot, "data", name), "utf8"));
}

async function loadData(bedrockRoot) {
	const entries = await Promise.all(DATA_FILES.map(name => readJson(bedrockRoot, name)));
	return Object.fromEntries(DATA_FILES.map((name, index) => [name, entries[index]]));
}

function runtimeRecords(data) {
	const records = (artifact, runtime, recipes) => recipes.map(record => ({ artifact, record, runtime }));
	return [
		...records("data/recipes/milling.json", "behavior_pack/scripts/processing/millstone-runtime.js", data["recipes/milling.json"]),
		...records("data/recipes/crushing.json", "behavior_pack/scripts/processing/crushing-wheel-runtime.js", data["recipes/crushing.json"]),
		...records("data/recipes/pressing.json", "behavior_pack/scripts/processing/mechanical-press-runtime.js", data["recipes/pressing.json"]),
		...records("data/recipes/basin.json", "behavior_pack/scripts/processing/stage3-processing-runtime.js", data["recipes/basin.json"]),
		...records("data/recipes/fan.json", "behavior_pack/scripts/processing/stage3-processing-runtime.js", data["recipes/fan.json"]),
		...records("data/recipes/cutting.json", "behavior_pack/scripts/processing/stage3-processing-runtime.js", data["recipes/cutting.json"]),
		...records("data/recipes/mechanical-crafting.json", "behavior_pack/scripts/processing/mechanical-crafter-runtime.js", data["recipes/mechanical-crafting.json"].recipes)
	];
}

function entryFromRecipe(recipe, execution, evidence, extra = {}) {
	return {
		evidence,
		execution,
		originalExecution: recipe.execution,
		originalStrategy: recipe.strategy,
		source: recipe.source,
		sourceId: recipe.id,
		...extra
	};
}

export function validateP73RecipeExecutionLedger(ledger) {
	if (!ledger || ledger.schemaVersion !== P73_RECIPE_EXECUTION_LEDGER_SCHEMA_VERSION || ledger.generatedAt !== "deterministic" || !Array.isArray(ledger.entries))
		throw new TypeError("P7.3 recipe execution ledger has an invalid header");
	const sourceIds = new Set();
	for (const entry of ledger.entries) {
		assertString(entry?.sourceId, "entry sourceId");
		assertString(entry?.execution, `entry ${entry.sourceId} execution`);
		assertString(entry?.originalExecution, `entry ${entry.sourceId} originalExecution`);
		assertString(entry?.originalStrategy, `entry ${entry.sourceId} originalStrategy`);
		if (!entry.source || typeof entry.source !== "object" || !Array.isArray(entry.evidence) || entry.evidence.length === 0
			|| entry.evidence.some(evidence => typeof evidence !== "string" || evidence.length === 0)
			|| !["external_compatibility", "native_recipe", "runtime_adapter_pending", "runtime_cooking_bridge", "runtime_machine", "scripted_interaction"].includes(entry.execution)
			|| sourceIds.has(entry.sourceId))
			throw new Error(`P7.3 recipe execution ledger has an invalid entry for ${entry.sourceId}`);
		sourceIds.add(entry.sourceId);
	}
	if (!exactJson(ledger.entries.map(entry => entry.sourceId), [...sourceIds].sort((left, right) => left.localeCompare(right))))
		throw new Error("P7.3 recipe execution ledger entries must be sorted by Java source identifier");
	const expectedSummary = summary(ledger.entries);
	if (!exactJson(ledger.summary, expectedSummary) || ledger.staticCovered !== staticCovered(ledger.entries))
		throw new Error("P7.3 recipe execution ledger summary is stale");
	return { entries: ledger.entries.length, staticCovered: ledger.staticCovered };
}

export async function buildP73RecipeExecutionLedger({ bedrockRoot }) {
	const data = await loadData(bedrockRoot);
	const nativeBySourceId = new Map(data["recipes/native.json"].records.map(record => [record.id, record]));
	const cookingBySourceId = new Map(data["p7-7-cooking-parity.json"].recipes.map(recipe => [recipe.sourceId, recipe]));
	const interactionBySourceId = new Map(data["recipes/interactions.json"].records
		.filter(record => record.status === "compiled")
		.map(record => [record.recipeId, record]));
	const sequencedBySourceId = new Map(data["recipes/sequenced-assembly.json"].recipes.map(recipe => [recipe.id, recipe]));
	const crushingCompatibility = new Map(data["recipes/crushing-import-report.json"].records
		.filter(record => record.status === "unsupported_dependency")
		.map(record => [record.source, record]));
	const convertedRuntime = runtimeRecords(data);
	const entries = data["recipes/recipe-ir.json"].recipes.map(recipe => {
		if (recipe.strategy === "external_compat")
			return entryFromRecipe(recipe, "external_compatibility", [recipe.source.path], { compatibility: "Java recipe declares an external compatibility decision" });
		if (recipe.strategy === "vanilla_recipe") {
			const native = nativeBySourceId.get(recipe.id);
			if (!native)
				throw new Error(`P7.3 native recipe ${recipe.id} has no native conversion record`);
			if (native.status === "emittable")
				return entryFromRecipe(recipe, "native_recipe", ["data/recipes/native.json", `behavior_pack/recipes/generated/${native.nativeId.slice("createbedrock:p7_2/".length)}.json`], { nativeId: native.nativeId });
			const cooking = cookingBySourceId.get(recipe.id);
			if (native.status !== "blocked_platform_semantics" || !cooking)
				throw new Error(`P7.3 native recipe ${recipe.id} is not covered by a cooking bridge`);
			return entryFromRecipe(recipe, "runtime_cooking_bridge", ["data/p7-7-cooking-parity.json", "behavior_pack/scripts/processing/cooking-parity-runtime.js"], { cookingId: cooking.id, platformVerification: "pending_windows_bedrock" });
		}
		if (recipe.strategy === "scripted_interaction") {
			if (interactionBySourceId.has(recipe.id))
				return entryFromRecipe(recipe, "scripted_interaction", ["data/recipes/interactions.json", "behavior_pack/scripts/processing/interaction-recipe-runtime.js"]);
			if (sequencedBySourceId.has(recipe.id))
				return entryFromRecipe(recipe, "runtime_adapter_pending", ["data/recipes/sequenced-assembly.json", "behavior_pack/scripts/processing/sequenced-assembly-controller.js"], { missingRuntime: "world_sequenced_assembly_adapter" });
			throw new Error(`P7.3 scripted interaction ${recipe.id} has no runtime conversion`);
		}
		if (recipe.strategy !== "runtime_machine")
			throw new Error(`P7.3 recipe ${recipe.id} has an unsupported strategy ${recipe.strategy}`);
		const converted = convertedRuntime.find(candidate => outputRecordMatches(candidate.record, recipe.id));
		if (converted)
			return entryFromRecipe(recipe, "runtime_machine", [converted.artifact, converted.runtime], { convertedId: converted.record.id, processor: recipe.source.type });
		const sourcePath = recipe.id.slice("create:crushing/".length);
		const compatibility = crushingCompatibility.get(sourcePath);
		if (!compatibility)
			throw new Error(`P7.3 machine recipe ${recipe.id} is neither converted nor marked as an unavailable dependency`);
		return entryFromRecipe(recipe, "external_compatibility", ["data/recipes/crushing-import-report.json"], { compatibility: compatibility.reason });
	}).sort((left, right) => left.sourceId.localeCompare(right.sourceId));
	const document = {
		entries,
		generatedAt: "deterministic",
		generatedFrom: "recipe IR, generated Bedrock recipe converters, and P7.7 cooking parity catalog",
		schemaVersion: P73_RECIPE_EXECUTION_LEDGER_SCHEMA_VERSION,
		staticCovered: staticCovered(entries),
		summary: summary(entries)
	};
	validateP73RecipeExecutionLedger(document);
	return document;
}
