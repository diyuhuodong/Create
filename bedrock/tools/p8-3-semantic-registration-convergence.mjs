import { readdir, readFile, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";

export const P8_3_SEMANTIC_REGISTRATION_SCHEMA_VERSION = 1;

const colors = ["white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray", "light_gray", "cyan", "purple", "blue", "brown", "green", "red", "black"];
const tableCloths = ["andesite_table_cloth", "brass_table_cloth", "copper_table_cloth", ...colors.map(color => `${color}_table_cloth`)];
const valveHandles = ["copper_valve_handle", ...colors.map(color => `${color}_valve_handle`)];
const id = name => name.includes(":") ? name : `createbedrock:${name}`;
const composite = (sourceKey, targets, behaviorPaths, rationale) => ({ sourceKey, mapping: { relation: "one_to_many_composite", targets: targets.map(id) }, behaviorPaths, rationale });
const virtual = (sourceKey, targets, behaviorPaths, rationale) => ({ sourceKey, mapping: { relation: "virtualized", targets: targets.map(id) }, behaviorPaths, rationale });
const item = (name, acquisitionPaths = []) => ({ sourceKey: `item:create:${name}`, mapping: { relation: "one_to_one", targets: [id(name)] }, acquisitionPaths, behaviorPaths: [], rationale: "The Bedrock item is acquired through the compiled recipe and material chain." });

// These are the deliberate semantic mappings for the registrations that P8.2
// cannot prove mechanically from the old matrix. Keep every relationship here:
// it is the reviewable boundary between Java registrations and Bedrock concepts.
export const P83_SEMANTIC_REGISTRATION_MAPPINGS = [
	virtual("block:create:chocolate", ["chocolate", "chocolate_bucket"], ["behavior_pack/scripts/fluids/fluid-registry.js", "behavior_pack/scripts/fluids/fluid-runtime.js"], "Chocolate is represented by a virtual fluid plus its placeable and bucket forms."),
	virtual("block:create:honey", ["honey", "honey_bucket"], ["behavior_pack/scripts/fluids/fluid-registry.js", "behavior_pack/scripts/fluids/fluid-runtime.js"], "Honey is represented by a virtual fluid plus its placeable and bucket forms."),
	virtual("fluid:create:chocolate", ["chocolate", "chocolate_bucket"], ["behavior_pack/scripts/fluids/fluid-registry.js", "behavior_pack/scripts/fluids/fluid-runtime.js"], "Bedrock has no custom fluid registry entry, so the fluid is virtualized through the fluid runtime."),
	virtual("fluid:create:honey", ["honey", "honey_bucket"], ["behavior_pack/scripts/fluids/fluid-registry.js", "behavior_pack/scripts/fluids/fluid-runtime.js"], "Bedrock has no custom fluid registry entry, so the fluid is virtualized through the fluid runtime."),
	virtual("fluid:create:potion", ["minecraft:potion"], ["behavior_pack/scripts/fluids/fluid-registry.js", "behavior_pack/scripts/fluids/fluid-runtime.js"], "Potion fluid delegates to Bedrock's native potion item while retaining Create fluid transactions."),
	virtual("fluid:create:tea", ["builders_tea"], ["behavior_pack/scripts/fluids/fluid-registry.js", "behavior_pack/scripts/fluids/fluid-runtime.js"], "Tea is virtualized through the Create fluid runtime and Builder's Tea item."),
	composite("block_entity:create:blaze_heater", ["blaze_burner", "lit_blaze_burner"], ["behavior_pack/scripts/materials/blaze-burner-runtime.js"], "The Java heater state is split between unlit and lit burner blocks."),
	composite("block_entity:create:bogey", ["small_bogey", "large_bogey"], ["behavior_pack/scripts/trains/rolling-stock-runtime.js", "behavior_pack/scripts/trains/rolling-stock-state.js"], "Small and large bogey blocks share one rolling-stock state model."),
	composite("block_entity:create:chassis", ["linear_chassis", "secondary_linear_chassis", "radial_chassis"], ["behavior_pack/scripts/contraptions/chassis-runtime.js"], "The Java chassis entity spans the three Bedrock chassis block forms."),
	composite("block_entity:create:copycat", ["copycat_panel", "copycat_step"], ["behavior_pack/scripts/materials/copycat-runtime.js"], "Bedrock's stateful copycat implementation is represented by panel and step forms."),
	composite("block_entity:create:cursed_bell", ["peculiar_bell", "haunted_bell"], ["behavior_pack/scripts/materials/bell-runtime.js"], "Both Create bell variants share the Bedrock bell runtime."),
	composite("block_entity:create:drill", ["mechanical_drill"], ["behavior_pack/scripts/contraptions/contraption-actors-runtime.js"], "The drill is executed as a contraption actor."),
	composite("block_entity:create:encased_cogwheel", ["andesite_encased_cogwheel", "brass_encased_cogwheel"], ["behavior_pack/scripts/kinetics/kinetic-runtime.js"], "Material-specific encased small cogwheels share the kinetic runtime."),
	composite("block_entity:create:encased_large_cogwheel", ["andesite_encased_large_cogwheel", "brass_encased_large_cogwheel"], ["behavior_pack/scripts/kinetics/kinetic-runtime.js"], "Material-specific encased large cogwheels share the kinetic runtime."),
	composite("block_entity:create:encased_shaft", ["andesite_encased_shaft", "brass_encased_shaft", "metal_girder_encased_shaft"], ["behavior_pack/scripts/kinetics/kinetic-runtime.js"], "The Java encased-shaft entity covers the Bedrock shaft variants."),
	composite("block_entity:create:factory_panel", ["factory_gauge"], ["behavior_pack/scripts/logistics/package-runtime.js"], "The Bedrock factory gauge is the package-network endpoint equivalent."),
	composite("block_entity:create:flap_display", ["display_board"], ["behavior_pack/scripts/materials/display-board-runtime.js"], "The display board provides the persistent flap-display equivalent."),
	composite("block_entity:create:funnel", ["andesite_funnel", "brass_funnel", "andesite_belt_funnel", "brass_belt_funnel"], ["behavior_pack/scripts/logistics/depot-runtime.js"], "Funnel forms are represented through the item-transport endpoint runtime."),
	composite("block_entity:create:gantry_pinion", ["gantry_carriage"], ["behavior_pack/scripts/contraptions/linear-actuator-runtime.js"], "The Java gantry pinion maps to the Bedrock gantry carriage actuator."),
	composite("block_entity:create:harvester", ["mechanical_harvester"], ["behavior_pack/scripts/contraptions/contraption-actors-runtime.js"], "The harvester is executed as a contraption actor."),
	composite("block_entity:create:motor", ["creative_motor"], ["behavior_pack/scripts/kinetics/kinetic-runtime.js"], "The creative motor is a Bedrock kinetic source."),
	composite("block_entity:create:saw", ["mechanical_saw"], ["behavior_pack/scripts/processing/stage3-processing-runtime.js", "behavior_pack/scripts/kinetics/kinetic-world.js"], "The saw combines processing and kinetic-world behavior."),
	composite("block_entity:create:simple_kinetic", ["shaft", "cogwheel", "large_cogwheel"], ["behavior_pack/scripts/kinetics/kinetic-runtime.js"], "Java's shared simple-kinetic entity is represented by its three concrete kinetic blocks."),
	composite("block_entity:create:sliding_door", ["andesite_door", "brass_door", "copper_door", "framed_glass_door", "train_door"], ["behavior_pack/scripts/materials/sliding-door-runtime.js", "behavior_pack/scripts/trains/rolling-stock-runtime.js"], "Door variants share the sliding-door and train-door state models."),
	composite("block_entity:create:table_cloth", tableCloths, ["behavior_pack/scripts/materials/table-cloth-runtime.js", "behavior_pack/scripts/kernel/functional-color-families.js"], "All metal and dyed table-cloth forms share the shop/display runtime."),
	composite("block_entity:create:valve_handle", valveHandles, ["behavior_pack/scripts/fluids/fluid-runtime.js", "behavior_pack/scripts/kernel/functional-color-families.js"], "Copper and dyed valve handles act as equivalent fluid-control inputs."),
	...[
		"andesite_alloy", "brass_ingot", "copper_nugget", "copper_sheet", "crushed_raw_copper", "crushed_raw_gold", "crushed_raw_iron", "crushed_raw_zinc", "golden_sheet", "incomplete_precision_mechanism", "incomplete_track", "iron_sheet", "polished_rose_quartz", "powdered_obsidian", "precision_mechanism", "raw_zinc", "rose_quartz", "sturdy_sheet", "unprocessed_obsidian_sheet", "wheat_flour", "zinc_ingot", "zinc_nugget"
	].map(name => item(name))
		.concat([item("chocolate_bucket", ["behavior_pack/scripts/fluids/fluid-runtime.js"]), item("honey_bucket", ["behavior_pack/scripts/fluids/fluid-runtime.js"])])
];

async function jsonFiles(directory) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) files.push(...await jsonFiles(path));
		else if (entry.name.endsWith(".json")) files.push(path);
	}
	return files;
}

async function artifacts(bedrockRoot) {
	const records = new Map();
	for (const [directory, key] of [["blocks", "minecraft:block"], ["items", "minecraft:item"], ["entities", "minecraft:entity"]]) {
		for (const file of await jsonFiles(resolve(bedrockRoot, "behavior_pack", directory))) {
			const identifier = JSON.parse(await readFile(file, "utf8"))[key]?.description?.identifier;
			if (typeof identifier === "string") records.set(identifier, relative(bedrockRoot, file).replaceAll("\\", "/"));
		}
	}
	return records;
}

function containsIdentifier(value, identifier) {
	if (value === identifier) return true;
	if (Array.isArray(value)) return value.some(entry => containsIdentifier(entry, identifier));
	if (value && typeof value === "object") return Object.values(value).some(entry => containsIdentifier(entry, identifier));
	return false;
}

function assertP83Convergence(document) {
	if (document?.schemaVersion !== P8_3_SEMANTIC_REGISTRATION_SCHEMA_VERSION || document.generatedAt !== "deterministic" || !Array.isArray(document.entries))
		throw new Error("P8.3 semantic registration convergence has an invalid header");
	const seen = new Set();
	for (const entry of document.entries) {
		if (typeof entry.sourceKey !== "string" || seen.has(entry.sourceKey) || !Array.isArray(entry.targets) || entry.targets.length === 0
			|| !Array.isArray(entry.behaviorPaths) || !["verified", "not_required"].includes(entry.behavior))
			throw new Error(`P8.3 has an invalid semantic registration ${entry.sourceKey ?? "unknown"}`);
		seen.add(entry.sourceKey);
	}
	if (JSON.stringify(document.entries.map(entry => entry.sourceKey)) !== JSON.stringify([...seen].sort((left, right) => left.localeCompare(right))))
		throw new Error("P8.3 semantic registration entries must be sorted");
	if (JSON.stringify(document.summary) !== JSON.stringify({ resolved: seen.size, total: seen.size }))
		throw new Error("P8.3 semantic registration summary is stale");
	return document.summary;
}

export async function buildP83SemanticRegistrationConvergence({ bedrockRoot, p82Convergence, overrides }) {
	const expected = new Set(p82Convergence.deferred.map(entry => entry.sourceKey));
	const mappings = new Map(P83_SEMANTIC_REGISTRATION_MAPPINGS.map(entry => [entry.sourceKey, entry]));
	if (mappings.size !== P83_SEMANTIC_REGISTRATION_MAPPINGS.length || expected.size !== mappings.size || [...expected].some(sourceKey => !mappings.has(sourceKey)))
		throw new Error("P8.3 semantic mappings must cover exactly the registrations deferred by P8.2");
	const [artifactPaths, recipeIr] = await Promise.all([
		artifacts(bedrockRoot), readFile(resolve(bedrockRoot, "data", "recipes", "recipe-ir.json"), "utf8").then(JSON.parse)
	]);
	const existing = new Map(overrides.entries.map(entry => [entry.sourceKey, structuredClone(entry)]));
	const entries = [];
	for (const mapping of mappings.values()) {
		for (const path of [...mapping.behaviorPaths, ...(mapping.acquisitionPaths ?? [])]) await stat(resolve(bedrockRoot, path));
		const targets = mapping.mapping.targets;
		const artifactPathsForTargets = targets.map(target => target.startsWith("minecraft:") ? null : artifactPaths.get(target));
		if (artifactPathsForTargets.some((path, index) => path === undefined && !targets[index].startsWith("minecraft:")))
			throw new Error(`P8.3 ${mapping.sourceKey} has a missing Bedrock target artifact`);
		if (mapping.sourceKey.startsWith("item:") && !targets.some(target => containsIdentifier(recipeIr, target)) && !(mapping.acquisitionPaths?.length))
			throw new Error(`P8.3 ${mapping.sourceKey} has no compiled recipe acquisition evidence`);
		const behavior = mapping.behaviorPaths.length === 0 ? "not_required" : "verified";
		existing.set(mapping.sourceKey, {
			acquisition: "verified",
			behavior,
			family: "P8.3/semantic-registration",
			mapping: mapping.mapping,
			p8Semantic: { package: "P8.3", source: mapping.rationale },
			resources: "verified",
			sourceKey: mapping.sourceKey,
			status: "implemented"
		});
		entries.push({ artifactPaths: artifactPathsForTargets, behavior, behaviorPaths: mapping.behaviorPaths, rationale: mapping.rationale, relation: mapping.mapping.relation, sourceKey: mapping.sourceKey, targets });
	}
	entries.sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
	const document = { entries, generatedAt: "deterministic", generatedFrom: ["data/p8-2-registration-convergence.json", "data/recipes/recipe-ir.json", "behavior_pack definitions and runtime scripts"], schemaVersion: P8_3_SEMANTIC_REGISTRATION_SCHEMA_VERSION, summary: { resolved: entries.length, total: entries.length } };
	assertP83Convergence(document);
	const updated = { ...structuredClone(overrides), entries: [...existing.values()].sort((left, right) => left.sourceKey.localeCompare(right.sourceKey)) };
	return { document, overrides: updated };
}

export { assertP83Convergence };
