import { P77_PLATFORM_IDS, validateP77ScenarioCatalog } from "./p7-7-acceptance-schema.mjs";

export const P77_GAP_LEDGER_SCHEMA_VERSION = 2;
export const P77_GAP_CLASSIFICATIONS = Object.freeze([
	"core_implementation_required",
	"static_verified_pending_platform",
	"platform_capability_blocked",
	"external_compat",
	"equivalent",
	"not_applicable"
]);

const GAP_CLASSIFICATIONS = new Set(P77_GAP_CLASSIFICATIONS);
const EXPLICIT_EQUIVALENCES = Object.freeze([
	Object.freeze({
		id: "equivalent/equipment/extendo-create-only-reach",
		owner: "P7.6",
		reason: "Bedrock cannot extend vanilla mining, placement, or entity-interaction reach; Extendo applies only to registered Create ray operations.",
		subject: "create:extendo_grip"
	}),
	Object.freeze({
		id: "equivalent/guidance/ponder-guide",
		owner: "P7.6",
		reason: "Bedrock Guide preserves each Ponder storyboard teaching outcome but does not reproduce Java's in-world cinematic renderer frame by frame.",
		subject: "create:ponder"
	})
]);

function assertObject(value, label) {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new TypeError(`P7.7 gap ledger ${label} must be an object`);
}

function assertString(value, label) {
	if (typeof value !== "string" || value.trim().length === 0)
		throw new TypeError(`P7.7 gap ledger ${label} must be a non-empty string`);
}

function countBy(entries, field) {
	return Object.fromEntries([...new Set(entries.map(entry => String(entry[field])))].sort().map(value => [
		value,
		entries.filter(entry => String(entry[field]) === value).length
	]));
}

function normalizedIssueKinds(record) {
	if (!Array.isArray(record.issues) || record.issues.length === 0)
		throw new Error(`P7.7 native recipe ${record.id} is blocked without issue details`);
	const issueKinds = [...new Set(record.issues.map(issue => issue?.kind))].sort();
	for (const kind of issueKinds)
		assertString(kind, `native recipe ${record.id} issue kind`);
	return issueKinds;
}

function summaryEntry({ classification, id, owner, reason, scope, subject, ...extra }) {
	return { classification, id, owner, reason, scope, subject, ...extra };
}

function platformEntries(catalog) {
	const entries = [];
	for (const platform of P77_PLATFORM_IDS)
		for (const scenario of catalog.scenarios)
			if (scenario.applicability[platform] !== "not_applicable")
				entries.push(summaryEntry({
					classification: "static_verified_pending_platform",
					id: `platform/${platform}/${scenario.id}`,
					owner: scenario.owner,
					reason: `Requires ${platform} runtime evidence for the ${scenario.applicability[platform]} P7.7 scenario.`,
					requirement: scenario.applicability[platform],
					scope: "platform_acceptance",
					subject: scenario.id
				}));
	return entries;
}

function nativeRecipeEntries(nativeRecipes, cookingParity) {
	const coveredRecipes = new Set(cookingParity.recipes.map(recipe => recipe.sourceId));
	return nativeRecipes.records
		.filter(record => record.status !== "emittable")
		.map(record => {
			const covered = coveredRecipes.has(record.id);
			return summaryEntry({
			classification: covered ? "platform_capability_blocked" : "core_implementation_required",
			id: `core/recipe/${record.id}`,
			issueKinds: normalizedIssueKinds(record),
			owner: "P7.7.2",
			reason: covered
				? "The managed cooking adapter preserves the Java contract statically; binding it to a native Bedrock cooking station is blocked until the platform bridge capability probe passes."
				: "The Bedrock-native recipe format cannot preserve this Java recipe's declared semantics without a managed adapter.",
			scope: "create_core",
			sourceStatus: record.status,
			subject: record.id
			});
		});
}

function externalCompatibilityEntries(recipeIr) {
	return recipeIr.recipes
		.filter(recipe => recipe.strategy === "external_compat")
		.map(recipe => {
			const decisionRefs = [...new Set(recipe.compatibility?.decisionRef ?? [])].sort();
			if (decisionRefs.length === 0)
				throw new Error(`P7.7 external compatibility recipe ${recipe.id} is missing a compatibility decision`);
			return summaryEntry({
				classification: "external_compat",
				compatibilityDecisionRefs: decisionRefs,
				id: `external_compat/recipe/${recipe.id}`,
				owner: "P7.0 compatibility decision",
				reason: "The Java recipe requires an external Java-mod namespace and is not part of the Bedrock base Create package.",
				scope: "external_mod",
				subject: recipe.id
			});
		});
}

function notApplicableResourceEntries(resources) {
	return resources.entries
		.filter(resource => resource.relation === "not_applicable")
		.map(resource => {
			assertString(resource.reason, `resource ${resource.source} not-applicable reason`);
			return summaryEntry({
				classification: "not_applicable",
				id: `not_applicable/resource/${encodeURIComponent(resource.source)}`,
				owner: "P7.6",
				reason: resource.reason,
				scope: "resource",
				subject: resource.source,
				target: resource.target
			});
		});
}

function explicitEquivalenceEntries() {
	return EXPLICIT_EQUIVALENCES.map(entry => summaryEntry({
		classification: "equivalent",
		...entry,
		scope: "create_core"
	}));
}

function sourceSummary({ cookingParity, interactions, matrix, nativeRecipes, recipeIr, resources, catalogCoverage }) {
	return {
		acceptance: {
			applicableChecks: catalogCoverage.applicableChecks,
			platforms: catalogCoverage.platforms,
			scenarios: catalogCoverage.scenarios
		},
		cookingParity: { ...cookingParity.summary },
		interactionRecipes: {
			status: countBy(interactions.records, "status"),
			total: interactions.records.length
		},
		migrationMatrix: {
			resourceStatus: countBy(matrix.entries, "resourceStatus"),
			status: countBy(matrix.entries, "status"),
			total: matrix.entries.length
		},
		nativeRecipes: {
			status: countBy(nativeRecipes.records, "status"),
			total: nativeRecipes.records.length
		},
		recipeIr: {
			strategies: countBy(recipeIr.recipes, "strategy"),
			total: recipeIr.recipes.length
		},
		resources: {
			relations: countBy(resources.entries, "relation"),
			status: countBy(resources.entries, "status"),
			total: resources.entries.length
		}
	};
}

function summarizeEntries(entries) {
	return {
		classifications: Object.fromEntries(P77_GAP_CLASSIFICATIONS.map(classification => [
			classification,
			entries.filter(entry => entry.classification === classification).length
		])),
		total: entries.length
	};
}

export function buildP77GapLedger({ cookingParity, interactions, matrix, nativeRecipes, recipeIr, resources, catalog }) {
	for (const [name, value] of Object.entries({ cookingParity, interactions, matrix, nativeRecipes, recipeIr, resources, catalog }))
		assertObject(value, name);
	for (const [name, value] of Object.entries({
		"interaction recipe records": interactions.records,
		"migration matrix entries": matrix.entries,
		"native recipe records": nativeRecipes.records,
		"recipe IR recipes": recipeIr.recipes,
		"resource ledger entries": resources.entries
	}))
		if (!Array.isArray(value))
			throw new TypeError(`P7.7 gap ledger ${name} must be an array`);
	if (!Array.isArray(cookingParity.recipes) || !cookingParity.summary || typeof cookingParity.summary !== "object")
		throw new TypeError("P7.7 gap ledger cooking parity catalog is invalid");
	const catalogCoverage = validateP77ScenarioCatalog(catalog);
	const entries = [
		...nativeRecipeEntries(nativeRecipes, cookingParity),
		...externalCompatibilityEntries(recipeIr),
		...platformEntries(catalog),
		...notApplicableResourceEntries(resources),
		...explicitEquivalenceEntries()
	].sort((left, right) => left.id.localeCompare(right.id));
	const document = {
		schemaVersion: P77_GAP_LEDGER_SCHEMA_VERSION,
		generatedAt: "deterministic",
		generatedFrom: [
			"data/recipes/native.json",
			"data/recipes/interactions.json",
			"data/recipes/recipe-ir.json",
			"data/migration-matrix.json",
			"data/p7-6-resource-ledger.json",
			"data/p7-7-scenario-catalog.json",
			"data/p7-7-cooking-parity.json"
		],
		sources: sourceSummary({ cookingParity, interactions, matrix, nativeRecipes, recipeIr, resources, catalogCoverage }),
		entries,
		summary: summarizeEntries(entries)
	};
	validateP77GapLedger(document);
	return document;
}

export function validateP77GapLedger(document) {
	assertObject(document, "document");
	if (document.schemaVersion !== P77_GAP_LEDGER_SCHEMA_VERSION)
		throw new Error(`P7.7 gap ledger must use schema version ${P77_GAP_LEDGER_SCHEMA_VERSION}`);
	if (document.generatedAt !== "deterministic" || !Array.isArray(document.generatedFrom) || document.generatedFrom.length !== 7)
		throw new Error("P7.7 gap ledger must declare its seven deterministic source documents");
	assertObject(document.sources, "sources");
	assertObject(document.summary, "summary");
	if (!Array.isArray(document.entries))
		throw new TypeError("P7.7 gap ledger entries must be an array");
	const ids = new Set();
	for (const entry of document.entries) {
		assertObject(entry, "entry");
		for (const field of ["classification", "id", "owner", "reason", "scope", "subject"])
			assertString(entry[field], `entry ${entry.id ?? "unknown"} ${field}`);
		if (!GAP_CLASSIFICATIONS.has(entry.classification))
			throw new Error(`P7.7 gap ledger entry ${entry.id} has an invalid classification`);
		if (ids.has(entry.id))
			throw new Error(`P7.7 gap ledger entry ${entry.id} is duplicated`);
		ids.add(entry.id);
		if (["core_implementation_required", "platform_capability_blocked"].includes(entry.classification)) {
			if (entry.scope !== "create_core" || !Array.isArray(entry.issueKinds) || entry.issueKinds.length === 0)
				throw new Error(`P7.7 core cooking entry ${entry.id} requires Create scope and issue kinds`);
		}
		if (entry.classification === "external_compat" && (!Array.isArray(entry.compatibilityDecisionRefs) || entry.compatibilityDecisionRefs.length === 0))
			throw new Error(`P7.7 external compatibility entry ${entry.id} requires a decision reference`);
	}
	if (JSON.stringify(document.entries.map(entry => entry.id)) !== JSON.stringify([...ids].sort((left, right) => left.localeCompare(right))))
		throw new Error("P7.7 gap ledger entries must be sorted by identifier");
	const expectedSummary = summarizeEntries(document.entries);
	if (JSON.stringify(document.summary) !== JSON.stringify(expectedSummary))
		throw new Error("P7.7 gap ledger summary is stale");
	for (const [name, expected] of Object.entries({
		"native recipe summary": document.sources.nativeRecipes,
		"interaction recipe summary": document.sources.interactionRecipes,
		"recipe IR summary": document.sources.recipeIr,
		"migration matrix summary": document.sources.migrationMatrix,
		"resource summary": document.sources.resources,
		"acceptance summary": document.sources.acceptance,
		"cooking parity summary": document.sources.cookingParity
	}))
		assertObject(expected, name);
	return {
		entries: document.entries.length,
		...document.summary
	};
}
