export const P8_C4_SEMANTIC_DIFFERENCE_SCHEMA_VERSION = 1;

const REQUIRED_IDS = Object.freeze([
	"native_cooking_bridge",
	"dynamic_assembly_budget",
	"honey_and_chocolate_world_fluids",
	"guidance_advancement_and_platform_scenarios",
	"external_java_mod_compatibility"
]);

function assertObject(value, label) {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new TypeError(`P8 C4 ${label} must be an object`);
}

function assertNonEmptyStrings(value, label) {
	if (!Array.isArray(value) || value.length === 0 || value.some(entry => typeof entry !== "string" || entry.length === 0))
		throw new TypeError(`P8 C4 ${label} must be a non-empty string array`);
}

function countBy(entries, predicate) {
	return entries.filter(predicate).length;
}

function cookingRecord({ cookingParity, gapLedger }) {
	const blocked = gapLedger.entries.filter(entry => entry.classification === "platform_capability_blocked");
	return {
		acceptance: [
			"Node: p7-7 cooking-parity catalog and P7.7 static contract cover every managed recipe.",
			"Platform: run the native-station capability probe before exposing a native furnace bridge."
		],
		id: "native_cooking_bridge",
		implementation: [
			"behavior_pack/scripts/processing/generated/cooking-parity-recipes.js",
			"tools/p7-7-cooking-parity.mjs"
		],
		limitationRationale: "Bedrock native furnace recipes cannot encode each Java cooking-time and experience value. The managed Create cooking adapter retains those values, while native-station binding remains capability-gated.",
		platformState: "blocked_pending_capability_probe",
		status: "platform_capability_blocked",
		subjects: blocked.map(entry => entry.subject).sort(),
		summary: { managedRecipes: cookingParity.summary.recipes },
		tests: ["tests/p7-7-gap-ledger.test.mjs", "tests/p7-7-acceptance.test.mjs"],
		userVisibleImpact: "The 22 listed recipes preserve Create-managed timing and XP, but players must not expect a vanilla furnace, smoker, blast furnace, or campfire to reproduce the Java-specific values until the platform probe succeeds."
	};
}

function dynamicAssemblyRecord() {
	return {
		acceptance: [
			"Node: snapshot and Stage 4 foundation contracts construct, collect, and serialize a full 512-block assembly.",
			"Platform: move, reload, and disassemble a 512-block contraption on Windows, Realm, and PS while observing performance and rollback."
		],
		id: "dynamic_assembly_budget",
		implementation: [
			"behavior_pack/scripts/contraptions/dynamic-assembly-snapshot.js#MAX_DYNAMIC_ASSEMBLY_BLOCKS",
			"behavior_pack/scripts/contraptions/assembly-collector.js"
		],
		limitationRationale: "Bedrock Add-On script/entity projection has a bounded per-assembly persistence and performance budget. The explicit 512-block cap prevents partial capture or an unbounded world mutation.",
		platformState: "pending_platform_performance_validation",
		status: "implemented_with_documented_difference",
		summary: { maxBlocks: 512 },
		tests: ["tests/dynamic-assembly-snapshot.test.mjs", "tests/stage4-dynamic-foundation-contract.test.mjs"],
		userVisibleImpact: "Assemblies and schematics above 512 blocks are rejected before movement or capture; supported assemblies retain deterministic save, recovery, and rollback behavior."
	};
}

function fluidRecord() {
	return {
		acceptance: [
			"Node: source projection tests extract and place exactly one full Honey or Chocolate bucket without fluid duplication.",
			"Platform: place, pump, restart, and reclaim static Honey and Chocolate source blocks; verify that they do not claim vanilla flowing-liquid physics."
		],
		id: "honey_and_chocolate_world_fluids",
		implementation: [
			"behavior_pack/scripts/fluids/fluid-registry.js",
			"behavior_pack/scripts/fluids/world-fluid-port.js"
		],
		limitationRationale: "Add-On blocks cannot integrate a custom flowing-liquid simulation into Bedrock's vanilla fluid engine. The transaction port therefore projects only complete static source blocks.",
		platformState: "pending_platform_world_interaction_validation",
		status: "implemented_with_documented_difference",
		summary: { staticWorldFluids: ["createbedrock:chocolate", "createbedrock:honey"] },
		tests: ["tests/world-fluid-port.test.mjs"],
		userVisibleImpact: "Honey and Chocolate can be bucketed and moved through Create fluid networks or placed as static full sources; they do not spread, level, or interact as native flowing fluids."
	};
}

function guidanceRecord({ guidanceLedger }) {
	return {
		acceptance: [
			"Node: generated guide pages cover each Ponder family/storyboard and every Java advancement has a classified local milestone.",
			"Platform: execute the owning P8.6 scenario for each feature family; platform scenarios, not the guide itself, establish runtime acceptance."
		],
		id: "guidance_advancement_and_platform_scenarios",
		implementation: [
			"behavior_pack/scripts/guidance/guidance-catalog.js",
			"data/p7-6-guidance-ledger.json",
			"data/p7-7-scenario-catalog.json"
		],
		limitationRationale: "Bedrock has no direct equivalent of Java Ponder's cinematic renderer, advancement trigger graph, or NeoForge GameTest harness. Guides and non-authoritative milestones teach/index outcomes; platform scenarios validate them.",
		platformState: "pending_platform_scenarios",
		status: "implemented_with_documented_difference",
		summary: {
			advancements: guidanceLedger.advancements.length,
			sceneFamilies: guidanceLedger.entries.length,
			storyboards: guidanceLedger.summary.storyboards
		},
		tests: ["tests/p7-6-guidance.test.mjs", "tests/p7-7-acceptance.test.mjs"],
		userVisibleImpact: "Players receive searchable guide pages and local milestones instead of Java's cinematic Ponder scenes and advancement UI; a guide page never by itself proves multiplayer or platform behavior."
	};
}

function externalCompatibilityRecord({ gapLedger }) {
	const external = gapLedger.entries.filter(entry => entry.classification === "external_compat");
	return {
		acceptance: [
			"Node: gap-ledger validation requires every external entry to retain external_mod scope and a compatibility decision reference.",
			"Release: report this count separately from Create-core implementation and platform acceptance."
		],
		id: "external_java_mod_compatibility",
		implementation: [
			"tools/p7-7-gap-ledger.mjs",
			"data/migration-ledger.json"
		],
		limitationRationale: "These entries describe integrations with separately distributed Java mods and their APIs, recipes, or items. They cannot be inferred from, or bundled into, the Create Bedrock core port.",
		platformState: "out_of_scope_for_create_core",
		status: "external_compat",
		summary: { externalCompatibilityEntries: external.length },
		tests: ["tests/p7-7-gap-ledger.test.mjs"],
		userVisibleImpact: "Core Create content remains usable without these integrations. Java-mod-specific recipes, APIs, and cross-mod automation are unavailable unless a separate Bedrock integration explicitly adds them."
	};
}

export function buildP8C4SemanticDifferenceLedger({ cookingParity, gapLedger, guidanceLedger }) {
	for (const [name, value] of Object.entries({ cookingParity, gapLedger, guidanceLedger }))
		assertObject(value, name);
	if (!Array.isArray(cookingParity.recipes) || !Array.isArray(gapLedger.entries) || !Array.isArray(guidanceLedger.entries) || !Array.isArray(guidanceLedger.advancements))
		throw new TypeError("P8 C4 requires cooking, gap, and guidance entry arrays");
	const document = {
		generatedAt: "deterministic",
		generatedFrom: ["data/p7-7-cooking-parity.json", "data/p7-7-gap-ledger.json", "data/p7-6-guidance-ledger.json"],
		records: [
			cookingRecord({ cookingParity, gapLedger }),
			dynamicAssemblyRecord(),
			fluidRecord(),
			guidanceRecord({ guidanceLedger }),
			externalCompatibilityRecord({ gapLedger })
		],
		schemaVersion: P8_C4_SEMANTIC_DIFFERENCE_SCHEMA_VERSION
	};
	document.summary = {
		externalCompatibilityEntries: countBy(document.records, record => record.status === "external_compat") === 1 ? document.records.find(record => record.id === "external_java_mod_compatibility").summary.externalCompatibilityEntries : 0,
		platformCapabilityBlocked: document.records.find(record => record.id === "native_cooking_bridge").summary.managedRecipes,
		records: document.records.length,
		staticDifferences: countBy(document.records, record => record.status === "implemented_with_documented_difference")
	};
	validateP8C4SemanticDifferenceLedger(document, { cookingParity, gapLedger, guidanceLedger });
	return document;
}

export function validateP8C4SemanticDifferenceLedger(document, { cookingParity, gapLedger, guidanceLedger } = {}) {
	assertObject(document, "semantic-difference ledger");
	if (document.schemaVersion !== P8_C4_SEMANTIC_DIFFERENCE_SCHEMA_VERSION || document.generatedAt !== "deterministic")
		throw new Error("P8 C4 semantic-difference ledger has an invalid schema or generation marker");
	if (JSON.stringify(document.generatedFrom) !== JSON.stringify(["data/p7-7-cooking-parity.json", "data/p7-7-gap-ledger.json", "data/p7-6-guidance-ledger.json"]))
		throw new Error("P8 C4 semantic-difference ledger has stale provenance");
	if (!Array.isArray(document.records) || JSON.stringify(document.records.map(record => record.id)) !== JSON.stringify(REQUIRED_IDS))
		throw new Error("P8 C4 semantic-difference ledger must contain the five ordered decisions");
	for (const record of document.records) {
		assertObject(record, `record ${record?.id ?? "unknown"}`);
		for (const field of ["id", "status", "platformState", "limitationRationale", "userVisibleImpact"])
			if (typeof record[field] !== "string" || record[field].length === 0)
				throw new TypeError(`P8 C4 record ${record.id ?? "unknown"} requires ${field}`);
		for (const field of ["acceptance", "implementation", "tests"])
			assertNonEmptyStrings(record[field], `record ${record.id} ${field}`);
		assertObject(record.summary, `record ${record.id} summary`);
	}
	const cooking = document.records[0];
	const dynamic = document.records[1];
	const fluids = document.records[2];
	const guidance = document.records[3];
	const compatibility = document.records[4];
	if (cooking.status !== "platform_capability_blocked" || cooking.platformState !== "blocked_pending_capability_probe" || !Array.isArray(cooking.subjects))
		throw new Error("P8 C4 cooking decision must remain an explicit capability block");
	if (dynamic.status !== "implemented_with_documented_difference" || dynamic.summary.maxBlocks !== 512)
		throw new Error("P8 C4 dynamic assembly decision must preserve the 512-block boundary");
	if (fluids.status !== "implemented_with_documented_difference" || JSON.stringify(fluids.summary.staticWorldFluids) !== JSON.stringify(["createbedrock:chocolate", "createbedrock:honey"]))
		throw new Error("P8 C4 fluid decision must declare the two static world fluids");
	if (guidance.status !== "implemented_with_documented_difference")
		throw new Error("P8 C4 guidance decision must be a documented difference");
	if (compatibility.status !== "external_compat" || compatibility.platformState !== "out_of_scope_for_create_core")
		throw new Error("P8 C4 external compatibility must remain outside Create core completion");
	if (!document.summary || document.summary.records !== REQUIRED_IDS.length || document.summary.staticDifferences !== 3)
		throw new Error("P8 C4 semantic-difference summary is stale");
	if (cookingParity && gapLedger && guidanceLedger) {
		const blocked = gapLedger.entries.filter(entry => entry.classification === "platform_capability_blocked");
		const external = gapLedger.entries.filter(entry => entry.classification === "external_compat");
		if (cooking.summary.managedRecipes !== cookingParity.summary.recipes || cooking.subjects.length !== blocked.length)
			throw new Error("P8 C4 cooking decision does not cover every platform-blocked recipe");
		if (blocked.some(entry => entry.scope !== "create_core") || external.some(entry => entry.scope !== "external_mod"))
			throw new Error("P8 C4 requires core cooking and external compatibility to remain separate scopes");
		if (compatibility.summary.externalCompatibilityEntries !== external.length || document.summary.externalCompatibilityEntries !== external.length)
			throw new Error("P8 C4 external compatibility summary is stale");
		if (guidance.summary.sceneFamilies !== guidanceLedger.entries.length || guidance.summary.advancements !== guidanceLedger.advancements.length || guidance.summary.storyboards !== guidanceLedger.summary.storyboards)
			throw new Error("P8 C4 guidance decision does not cover the generated guidance ledger");
	}
	return document.summary;
}
