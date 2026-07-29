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

test("P7.7 gap ledger records core gaps separately from compatibility and platform work", async () => {
	const document = buildP77GapLedger(await inputs());
	assert.deepEqual(document.summary, {
		classifications: {
			core_audit_required: 1319,
			core_implementation_required: 9410,
			static_verified_pending_platform: 52,
			platform_capability_blocked: 22,
			external_compat: 601,
			equivalent: 2,
			not_applicable: 92
		},
		total: 11498
	});
	assert.deepEqual(document.sources.migrationLedger, {
		registrations: { status: { implemented: 424, partial: 457 }, total: 881 },
		domains: { status: { deferred_compat: 114, partial: 8953 }, total: 9067 }
	});
	assert.equal(document.sources.javaBehaviorInventory.total, 1319);
	assert.equal(document.sources.parityEvidence.total, 11267);
	assert.equal(document.sources.nativeRecipes.status.blocked_platform_semantics, 22);
	assert.equal(document.sources.migrationMatrix.status.static_verified, 362);
	assert.equal(document.sources.migrationMatrix.resourceStatus.partial, 362);
	assert.equal(document.sources.resources.status.static_verified, 5016);
	assert.equal(document.sources.acceptance.applicableChecks, 52);
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
