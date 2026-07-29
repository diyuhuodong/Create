import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildP77GapLedger, validateP77GapLedger } from "../tools/p7-7-gap-ledger.mjs";

const bedrockRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function json(path) {
	return JSON.parse(await readFile(path, "utf8"));
}

async function inputs() {
	const dataRoot = resolve(bedrockRoot, "data");
	return {
		cookingParity: await json(resolve(dataRoot, "p7-7-cooking-parity.json")),
		interactions: await json(resolve(dataRoot, "recipes", "interactions.json")),
		javaBehaviorInventory: await json(resolve(dataRoot, "java-behavior-inventory.json")),
		matrix: await json(resolve(dataRoot, "migration-matrix.json")),
		migrationLedger: await json(resolve(dataRoot, "migration-ledger.json")),
		nativeRecipes: await json(resolve(dataRoot, "recipes", "native.json")),
		parityEvidence: await json(resolve(dataRoot, "p8-parity-evidence-ledger.json")),
		recipeIr: await json(resolve(dataRoot, "recipes", "recipe-ir.json")),
		resources: await json(resolve(dataRoot, "p7-6-resource-ledger.json")),
		catalog: await json(resolve(dataRoot, "p7-7-scenario-catalog.json"))
	};
}

function countBy(entries, field) {
	return Object.fromEntries([...new Set(entries.map(entry => String(entry[field])))].sort()
		.map(value => [value, entries.filter(entry => String(entry[field]) === value).length]));
}

test("P7.7 gap ledger records core gaps separately from compatibility and platform work", async () => {
	const source = await inputs();
	const document = buildP77GapLedger(source);
	const coverage = validateP77GapLedger(document);
	for (const [classification, total] of Object.entries(coverage.classifications))
		assert.equal(total, document.entries.filter(entry => entry.classification === classification).length);
	assert.equal(coverage.total, document.entries.length);
	const pendingBehaviors = source.javaBehaviorInventory.entries.filter(entry => entry.status === "audit_pending").length;
	const incompleteMigration = [
		...source.migrationLedger.registrationEntries,
		...source.migrationLedger.domainEntries
	].filter(entry => ["partial", "missing"].includes(entry.status)).length;
	const managedCooking = new Set(source.cookingParity.recipes.map(recipe => recipe.sourceId));
	const incompleteNative = source.nativeRecipes.records
		.filter(entry => entry.status !== "emittable" && !managedCooking.has(entry.id)).length;
	assert.equal(document.summary.classifications.core_audit_required, pendingBehaviors);
	assert.equal(document.summary.classifications.core_implementation_required, incompleteMigration + incompleteNative);
	assert.equal(document.summary.classifications.not_applicable,
		source.migrationLedger.domainEntries.filter(entry => entry.status === "not_applicable").length);
	assert.deepEqual(document.sources.migrationLedger, {
		registrations: {
			status: countBy(source.migrationLedger.registrationEntries, "status"),
			total: source.migrationLedger.registrationEntries.length
		},
		domains: {
			status: countBy(source.migrationLedger.domainEntries, "status"),
			total: source.migrationLedger.domainEntries.length
		}
	});
	assert.equal(document.sources.javaBehaviorInventory.total, source.javaBehaviorInventory.entries.length);
	assert.equal(document.sources.parityEvidence.total, source.parityEvidence.records.length);
	assert.deepEqual(document.sources.nativeRecipes.status, countBy(source.nativeRecipes.records, "status"));
	assert.deepEqual(document.sources.migrationMatrix.status, countBy(source.matrix.entries, "status"));
	assert.deepEqual(document.sources.migrationMatrix.resourceStatus, countBy(source.matrix.entries, "resourceStatus"));
	assert.deepEqual(document.sources.resources.status, countBy(source.resources.entries, "status"));
	const applicableChecks = source.catalog.scenarios.reduce((total, scenario) =>
		total + Object.values(scenario.applicability).filter(value => value !== "not_applicable").length, 0);
	assert.equal(document.sources.acceptance.applicableChecks, applicableChecks);
	assert.ok(document.entries.filter(entry => entry.classification === "platform_capability_blocked")
		.every(entry => entry.scope === "create_core" && entry.owner === "P7.7.2"));
	assert.ok(document.entries.filter(entry => entry.classification === "external_compat")
		.every(entry => entry.scope === "external_mod" && entry.compatibilityDecisionRefs.length > 0));
	assert.ok(document.entries.filter(entry => entry.classification === "core_audit_required")
		.every(entry => entry.subject.startsWith("behavior:") && entry.owner.startsWith("P8.3/")));
});

test("P7.7 gap ledger rejects duplicate and unclassified entries", async () => {
	const document = buildP77GapLedger(await inputs());
	const duplicate = structuredClone(document);
	duplicate.entries.push(structuredClone(duplicate.entries[0]));
	assert.throws(() => validateP77GapLedger(duplicate), /duplicated/);
	const invalid = structuredClone(document);
	invalid.entries[0].classification = "missing";
	assert.throws(() => validateP77GapLedger(invalid), /invalid classification/);
	const injected = await inputs();
	injected.migrationLedger.registrationEntries.find(entry => entry.sourceKey === "item:create:brass_sheet").status = "partial";
	const injectedDocument = buildP77GapLedger(injected);
	assert.ok(injectedDocument.entries.some(entry => entry.id === "core/registration/item%3Acreate%3Abrass_sheet"));
	const unmapped = await inputs();
	unmapped.migrationLedger.registrationEntries.find(entry => entry.sourceKey === "item:create:brass_sheet").mapping.targets = [];
	assert.throws(() => buildP77GapLedger(unmapped), /missing a Bedrock projection/);
});

test("generated P7.7 gap ledger is current", async () => {
	const dataRoot = resolve(bedrockRoot, "data");
	const [actual, expected] = await Promise.all([
		json(resolve(dataRoot, "p7-7-gap-ledger.json")),
		inputs().then(buildP77GapLedger)
	]);
	assert.deepEqual(actual, expected);
});
