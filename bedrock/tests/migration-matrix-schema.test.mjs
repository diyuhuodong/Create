import assert from "node:assert/strict";
import test from "node:test";

import { classifyRegistration } from "../tools/migration-classification.mjs";
import { validateMigrationMatrix } from "../tools/migration-matrix-schema.mjs";

function validEntry(overrides = {}) {
	return {
		acceptanceId: "LOGISTICS-ANDESITE-FUNNEL-BLOCK",
		bedrockIdentifier: "createbedrock:andesite_funnel",
		behaviorPath: null,
		blockingReason: null,
		domain: "logistics",
		javaIdentifier: "create:andesite_funnel",
		kind: "block",
		persistenceSchema: null,
		phase: 3,
		resourceStatus: "pending",
		source: "src/main/java/com/simibubi/create/AllBlocks.java",
		status: "specification_pending",
		...overrides
	};
}

function validMatrix(entries = [validEntry()]) {
	return {
		classificationRulesVersion: 1,
		entries,
		generatedAt: "deterministic",
		generatedFrom: "test",
		schemaVersion: 2
	};
}

test("migration classification preserves Stage-2 prototypes and assigns Stage-3 domains", () => {
	assert.deepEqual(classifyRegistration("shaft", "block"), {
		acceptanceId: "KINETICS-SHAFT-BLOCK",
		behaviorPath: "behavior_pack/scripts/kinetics/kinetic-runtime.js",
		blockingReason: null,
		domain: "kinetics",
		persistenceSchema: 1,
		phase: 2,
		resourceStatus: "partial",
		status: "implementation_in_progress"
	});
	assert.equal(classifyRegistration("andesite_funnel", "block").domain, "logistics");
	assert.equal(classifyRegistration("fluid_tank", "block").domain, "fluids");
	assert.equal(classifyRegistration("analog_lever", "block").domain, "redstone");
	assert.equal(classifyRegistration("andesite_funnel", "block").phase, 3);
});

test("migration classification records S3-4 processor behavior independently of unfinished visuals", () => {
	assert.deepEqual(classifyRegistration("millstone", "block"), {
		acceptanceId: "PROCESSING-MILLSTONE-BLOCK",
		behaviorPath: "behavior_pack/scripts/processing/millstone-runtime.js",
		blockingReason: null,
		domain: "processing",
		persistenceSchema: 2,
		phase: 3,
		resourceStatus: "partial",
		status: "static_verified"
	});
});

test("migration classification assigns later dynamic, train, and equipment work to their planned phases", () => {
	assert.deepEqual(classifyRegistration("mechanical_piston", "block").phase, 4);
	assert.deepEqual(classifyRegistration("track_signal", "block").phase, 5);
	assert.deepEqual(classifyRegistration("backtank", "item").phase, 6);
});

test("migration matrix validation accepts complete schema-v2 entries", () => {
	assert.doesNotThrow(() => validateMigrationMatrix(validMatrix()));
});

test("migration matrix validation rejects missing classifications, duplicate acceptance IDs, and unexplained blockers", () => {
	assert.throws(() => validateMigrationMatrix(validMatrix([validEntry({ domain: "unknown" })])), /unknown domain/);
	assert.throws(() => validateMigrationMatrix(validMatrix([validEntry(), validEntry({ javaIdentifier: "create:brass_funnel" })])), /duplicate acceptance ID/);
	assert.throws(() => validateMigrationMatrix(validMatrix([validEntry({ status: "blocked" })])), /requires a reason/);
	assert.throws(() => validateMigrationMatrix(validMatrix([validEntry({ persistenceSchema: 0 })])), /invalid persistence schema/);
});
