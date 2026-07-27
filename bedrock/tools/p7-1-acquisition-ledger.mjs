import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

export const P71_ACQUISITION_LEDGER_SCHEMA_VERSION = 1;

const NON_RECIPE_PATHS = new Map([
	["createbedrock:blaze_burner", ["runtime_transform", "behavior_pack/scripts/materials/blaze-burner-runtime.js"]],
	["createbedrock:chest_minecart_contraption", ["runtime_state", "behavior_pack/scripts/trains/minecart-contraption-runtime.js"]],
	["createbedrock:chocolate_bucket", ["runtime_transform", "behavior_pack/scripts/fluids/fluid-runtime.js"]],
	["createbedrock:chromatic_compound", ["runtime_transform", "behavior_pack/scripts/materials/legacy-materials-runtime.js"]],
	["createbedrock:copycat_bars", ["missing", "R2/content-copycats"]],
	["createbedrock:copycat_base", ["missing", "R2/content-copycats"]],
	["createbedrock:creative_blaze_cake", ["creative_only", "behavior_pack/items/creative_blaze_cake.json"]],
	["createbedrock:creative_crate", ["creative_only", "behavior_pack/blocks/creative_crate.json"]],
	["createbedrock:creative_fluid_tank", ["creative_only", "behavior_pack/blocks/creative_fluid_tank.json"]],
	["createbedrock:creative_motor", ["creative_only", "behavior_pack/blocks/creative_motor.json"]],
	["createbedrock:deepslate_zinc_ore", ["worldgen", "behavior_pack/features/zinc_ore.json"]],
	["createbedrock:elevator_contact", ["missing", "R2/content-elevator-contact"]],
	["createbedrock:furnace_minecart_contraption", ["runtime_state", "behavior_pack/scripts/trains/minecart-contraption-runtime.js"]],
	["createbedrock:handheld_worldshaper", ["creative_only", "behavior_pack/items/handheld_worldshaper.json"]],
	["createbedrock:honey_bucket", ["runtime_transform", "behavior_pack/scripts/fluids/fluid-runtime.js"]],
	["createbedrock:lit_blaze_burner", ["runtime_state", "behavior_pack/scripts/materials/blaze-burner-runtime.js"]],
	["createbedrock:mechanical_piston_head", ["runtime_state", "behavior_pack/scripts/contraptions/linear-actuator-runtime.js"]],
	["createbedrock:minecart_anchor", ["runtime_state", "behavior_pack/scripts/trains/minecart-contraption-runtime.js"]],
	["createbedrock:minecart_contraption", ["runtime_state", "behavior_pack/scripts/trains/minecart-contraption-runtime.js"]],
	["createbedrock:powered_shaft", ["runtime_state", "behavior_pack/scripts/kinetics/kinetic-runtime.js"]],
	["createbedrock:pulley_magnet", ["runtime_state", "behavior_pack/scripts/contraptions/linear-actuator-runtime.js"]],
	["createbedrock:refined_radiance", ["runtime_transform", "behavior_pack/scripts/materials/legacy-materials-runtime.js"]],
	["createbedrock:refined_radiance_casing", ["runtime_state", "behavior_pack/scripts/materials/legacy-materials-runtime.js"]],
	["createbedrock:rope", ["runtime_state", "behavior_pack/scripts/contraptions/linear-actuator-runtime.js"]],
	["createbedrock:schematic", ["runtime_state", "behavior_pack/scripts/schematics/schematic-runtime.js"]],
	["createbedrock:shadow_steel", ["runtime_transform", "behavior_pack/scripts/materials/legacy-materials-runtime.js"]],
	["createbedrock:shadow_steel_casing", ["runtime_state", "behavior_pack/scripts/materials/legacy-materials-runtime.js"]],
	["createbedrock:shopping_list", ["runtime_state", "behavior_pack/scripts/schematics/clipboard-runtime.js"]],
	["createbedrock:steam_whistle_extension", ["runtime_state", "behavior_pack/scripts/materials/steam-whistle-runtime.js"]],
	["createbedrock:water_wheel_structure", ["runtime_state", "behavior_pack/scripts/kinetics/kinetic-runtime.js"]],
	["createbedrock:zinc_ore", ["worldgen", "behavior_pack/features/zinc_ore.json"]]
]);

async function filesUnder(directory) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const file = resolve(directory, entry.name);
		if (entry.isDirectory())
			files.push(...await filesUnder(file));
		else if (entry.name.endsWith(".json"))
			files.push(file);
	}
	return files;
}

function collectOutputs(value, outputs, source, outputContext = false) {
	if (Array.isArray(value)) {
		for (const item of value)
			collectOutputs(item, outputs, source, outputContext);
		return;
	}
	if (!value || typeof value !== "object")
		return;
	for (const [key, child] of Object.entries(value)) {
		const childOutputContext = outputContext || ["output", "outputs", "result", "results"].includes(key);
		if (childOutputContext && (key === "typeId" || key === "item") && typeof child === "string") {
			const sources = outputs.get(child) ?? new Set();
			sources.add(source);
			outputs.set(child, sources);
		}
		collectOutputs(child, outputs, source, childOutputContext);
	}
}

async function recipeOutputs(repositoryRoot, directories) {
	const outputs = new Map();
	for (const directory of directories) {
		for (const file of await filesUnder(resolve(repositoryRoot, directory))) {
			const source = relative(repositoryRoot, file).replaceAll("\\", "/");
			collectOutputs(JSON.parse(await readFile(file, "utf8")), outputs, source);
		}
	}
	return outputs;
}

function sameSummary(left, right) {
	return Object.keys({ ...left, ...right }).every(key => left[key] === right[key]);
}

export function validateP71AcquisitionLedger(ledger) {
	if (!ledger || ledger.schemaVersion !== P71_ACQUISITION_LEDGER_SCHEMA_VERSION || ledger.generatedAt !== "deterministic" || !Array.isArray(ledger.entries))
		throw new TypeError("P7.1 acquisition ledger has an invalid header");
	const ids = new Set();
	for (const entry of ledger.entries) {
		if (typeof entry?.identifier !== "string" || ids.has(entry.identifier) || !["creative_only", "missing", "recipe_output", "runtime_state", "runtime_transform", "worldgen"].includes(entry.status)
			|| !Array.isArray(entry.evidence) || entry.evidence.length === 0)
			throw new Error("P7.1 acquisition ledger has an invalid entry");
		ids.add(entry.identifier);
	}
	const summary = Object.fromEntries([...new Set(ledger.entries.map(entry => entry.status))].sort().map(status => [status, ledger.entries.filter(entry => entry.status === status).length]));
	if (!sameSummary(ledger.summary, summary))
		throw new Error("P7.1 acquisition ledger summary is stale");
	return { entries: ledger.entries.length, missing: summary.missing ?? 0 };
}

export async function buildP71AcquisitionLedger({ bedrockRoot }) {
	const ledger = JSON.parse(await readFile(resolve(bedrockRoot, "data/migration-ledger.json"), "utf8"));
	const outputs = await recipeOutputs(bedrockRoot, ["behavior_pack/recipes", "data/recipes"]);
	const identifiers = new Set();
	for (const entry of ledger.registrationEntries)
		if (entry.family === "P7.1/content_and_acquisition" && entry.status === "partial")
			for (const target of entry.mapping.targets)
				identifiers.add(target);
	const entries = [...identifiers].sort().map(identifier => {
		const recipeEvidence = [...(outputs.get(identifier) ?? [])].sort();
		if (recipeEvidence.length > 0)
			return { evidence: recipeEvidence, identifier, status: "recipe_output" };
		const [status, evidence] = NON_RECIPE_PATHS.get(identifier) ?? ["missing", "R2/unclassified-acquisition"];
		return { evidence: [evidence], identifier, status };
	});
	const document = {
		entries,
		generatedAt: "deterministic",
		generatedFrom: "bedrock/data/migration-ledger.json, Bedrock recipes, and normalized recipe data",
		schemaVersion: P71_ACQUISITION_LEDGER_SCHEMA_VERSION,
		summary: Object.fromEntries([...new Set(entries.map(entry => entry.status))].sort().map(status => [status, entries.filter(entry => entry.status === status).length]))
	};
	validateP71AcquisitionLedger(document);
	return document;
}
