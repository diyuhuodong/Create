import { access, readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

export const P71_ACQUISITION_LEDGER_SCHEMA_VERSION = 2;

const NON_RECIPE_PATHS = new Map([
	["createbedrock:blaze_burner", ["runtime_transform", "behavior_pack/scripts/materials/blaze-burner-runtime.js"]],
	["createbedrock:chest_minecart_contraption", ["runtime_state", "behavior_pack/scripts/trains/minecart-contraption-runtime.js"]],
	["createbedrock:chocolate_bucket", ["runtime_transform", "behavior_pack/scripts/fluids/fluid-runtime.js"]],
	["createbedrock:chromatic_compound", ["runtime_transform", "behavior_pack/scripts/materials/legacy-materials-runtime.js"]],
	// AllBlocks intentionally omits .item() for both and their Java loot tables
	// return air. They are internal copycat render bases, not survival items.
	["createbedrock:copycat_bars", ["not_survival_content", "src/main/java/com/simibubi/create/AllBlocks.java#COPYCAT_BARS"]],
	["createbedrock:copycat_base", ["not_survival_content", "src/main/java/com/simibubi/create/AllBlocks.java#COPYCAT_BASE"]],
	["createbedrock:creative_blaze_cake", ["creative_only", "behavior_pack/items/creative_blaze_cake.json"]],
	["createbedrock:creative_crate", ["creative_only", "behavior_pack/blocks/creative_crate.json"]],
	["createbedrock:creative_fluid_tank", ["creative_only", "behavior_pack/blocks/creative_fluid_tank.json"]],
	["createbedrock:creative_motor", ["creative_only", "behavior_pack/blocks/creative_motor.json"]],
	// Java creates this invisible processor only between a valid pair of Crushing
	// Wheels; it has no item, loot table, or survival acquisition path.
	["createbedrock:crushing_wheel_controller", ["not_survival_content", "src/main/java/com/simibubi/create/AllBlocks.java#CRUSHING_WHEEL_CONTROLLER"]],
	["createbedrock:deepslate_zinc_ore", ["worldgen", "behavior_pack/feature_rules/deepslate_zinc_ore_underground.json"]],
	// Java has no recipe and its loot table returns redstone_contact, so this is
	// a runtime elevator state rather than a separately recoverable survival item.
	["createbedrock:elevator_contact", ["runtime_state", "src/main/java/com/simibubi/create/AllBlocks.java#ELEVATOR_CONTACT"]],
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
	["createbedrock:zinc_ore", ["worldgen", "behavior_pack/feature_rules/zinc_ore_underground.json"]]
]);

for (const identifier of [
	"cardboard_package_10x12", "cardboard_package_10x8", "cardboard_package_12x10", "cardboard_package_12x12",
	"rare_creeper_package", "rare_darcy_package", "rare_evan_package", "rare_jinx_package", "rare_kryppers_package",
	"rare_simi_package", "rare_starlotte_package", "rare_thunder_package", "rare_up_package", "rare_vector_package"
])
	NON_RECIPE_PATHS.set(`createbedrock:${identifier}`, ["runtime_transform", "behavior_pack/scripts/logistics/package-styles.js"]);

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

async function lootOutputs(repositoryRoot) {
	const outputs = new Map();
	for (const file of await filesUnder(resolve(repositoryRoot, "behavior_pack/loot_tables"))) {
		const source = relative(repositoryRoot, file).replaceAll("\\", "/");
		const visit = value => {
			if (Array.isArray(value)) {
				for (const item of value) visit(item);
				return;
			}
			if (!value || typeof value !== "object") return;
			if (value.type === "item" && typeof value.name === "string") {
				const sources = outputs.get(value.name) ?? new Set();
				sources.add(source);
				outputs.set(value.name, sources);
			}
			for (const child of Object.values(value)) visit(child);
		};
		visit(JSON.parse(await readFile(file, "utf8")));
	}
	return outputs;
}

async function assertNonRecipeEvidence(bedrockRoot, entries) {
	for (const entry of entries) {
		for (const evidence of entry.evidence) {
			const source = evidence.split("#", 1)[0];
			const root = source.startsWith("src/") ? resolve(bedrockRoot, "..") : bedrockRoot;
			try {
				await access(resolve(root, source));
			} catch {
				throw new Error(`P7.1 acquisition evidence for ${entry.identifier} is missing: ${evidence}`);
			}
		}
	}
}

function sameSummary(left, right) {
	return Object.keys({ ...left, ...right }).every(key => left[key] === right[key]);
}

export function validateP71AcquisitionLedger(ledger) {
	if (!ledger || ledger.schemaVersion !== P71_ACQUISITION_LEDGER_SCHEMA_VERSION || ledger.generatedAt !== "deterministic" || !Array.isArray(ledger.entries))
		throw new TypeError("P7.1 acquisition ledger has an invalid header");
	const ids = new Set();
	for (const entry of ledger.entries) {
		if (typeof entry?.identifier !== "string" || ids.has(entry.identifier) || !["creative_only", "loot_output", "missing", "not_survival_content", "recipe_output", "runtime_state", "runtime_transform", "worldgen"].includes(entry.status)
			|| !Array.isArray(entry.evidence) || entry.evidence.length === 0 || !Array.isArray(entry.registrationSourceKeys) || entry.registrationSourceKeys.length === 0)
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
	const loot = await lootOutputs(bedrockRoot);
	const projections = new Map();
	for (const entry of ledger.registrationEntries)
		if (entry.status === "implemented" && ["block", "item"].includes(entry.kind))
			for (const target of entry.mapping.targets.filter(target => target.startsWith("createbedrock:"))) {
				const sources = projections.get(target) ?? new Set();
				sources.add(entry.sourceKey);
				projections.set(target, sources);
			}
	const entries = [...projections].sort(([left], [right]) => left.localeCompare(right)).map(([identifier, sourceKeys]) => {
		const registrationSourceKeys = [...sourceKeys].sort();
		// Explicit lifecycle decisions take precedence over resource remnants.  The
		// crushing-wheel controller is an internal Java block and must never become
		// a survival-acquirable item merely because an older pack still has a recipe.
		const explicit = NON_RECIPE_PATHS.get(identifier);
		if (explicit) {
			const [status, evidence] = explicit;
			return { evidence: [evidence], identifier, registrationSourceKeys, status };
		}
		const recipeEvidence = [...(outputs.get(identifier) ?? [])].sort();
		if (recipeEvidence.length > 0)
			return { evidence: recipeEvidence, identifier, registrationSourceKeys, status: "recipe_output" };
		const lootEvidence = [...(loot.get(identifier) ?? [])].sort();
		if (lootEvidence.length > 0)
			return { evidence: lootEvidence, identifier, registrationSourceKeys, status: "loot_output" };
		return { evidence: ["R2/unclassified-acquisition"], identifier, registrationSourceKeys, status: "missing" };
	});
	const document = {
		entries,
		generatedAt: "deterministic",
		generatedFrom: "bedrock/data/migration-ledger.json, Bedrock recipes, loot tables, and explicit runtime acquisition decisions",
		schemaVersion: P71_ACQUISITION_LEDGER_SCHEMA_VERSION,
		summary: Object.fromEntries([...new Set(entries.map(entry => entry.status))].sort().map(status => [status, entries.filter(entry => entry.status === status).length]))
	};
	validateP71AcquisitionLedger(document);
	await assertNonRecipeEvidence(bedrockRoot, entries);
	return document;
}
