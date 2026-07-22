import assert from "node:assert/strict";
import test from "node:test";

import { createTrainAuthorityRecords, migrateLegacyTrainSnapshot, readTrainAuthorityRecords, trainAuthorityPartition, TRAIN_AUTHORITY_SCHEMA_VERSION } from "../behavior_pack/scripts/trains/train-authority-state.js";

test("train authority records are partitioned by dimension and preserve graph/train snapshots", () => {
	const records = createTrainAuthorityRecords({
		dimensions: [{ dimensionId: "minecraft:overworld", graph: { chunks: [] }, trains: [{ id: "train:1" }] }],
		nextTrainId: 2
	});
	assert.equal(records[0].schemaVersion, TRAIN_AUTHORITY_SCHEMA_VERSION);
	assert.equal(trainAuthorityPartition(records[0]), "meta");
	assert.equal(trainAuthorityPartition(records[1]), "dimension:minecraft:overworld");
	assert.deepEqual(readTrainAuthorityRecords(records), {
		dimensions: [{ dimensionId: "minecraft:overworld", graph: { chunks: [] }, stations: [], trains: [{ id: "train:1" }] }],
		nextTrainId: 2,
		portalTransfers: []
	});
});

test("train authority storage rejects incomplete or conflicting state rather than guessing a route", () => {
	assert.throws(() => readTrainAuthorityRecords([]), /missing its meta/);
	assert.throws(() => createTrainAuthorityRecords({ dimensions: [{ dimensionId: "overworld", graph: {}, trains: [] }, { dimensionId: "overworld", graph: {}, trains: [] }], nextTrainId: 1 }), /Duplicate/);
	assert.throws(() => trainAuthorityPartition({ kind: "unknown" }), /Unknown/);
	assert.throws(() => readTrainAuthorityRecords([{ kind: "train_authority_meta", nextTrainId: 1, schemaVersion: 4 }]), /Unsupported/);
});

test("legacy train snapshots are converted before runtime topology validation", () => {
	assert.deepEqual(migrateLegacyTrainSnapshot({ dimensions: [{ dimensionId: "overworld", graph: { chunks: [] }, trains: [] }], nextTrainId: 3 }), {
		dimensions: [{ dimensionId: "overworld", graph: { chunks: [] }, stations: [], trains: [] }],
		nextTrainId: 3,
		portalTransfers: []
	});
});

test("schema-2 authority records migrate stations and Portal journals to empty state", () => {
	assert.deepEqual(readTrainAuthorityRecords([
		{ kind: "train_authority_meta", nextTrainId: 2, schemaVersion: 2 },
		{ dimensionId: "overworld", graph: {}, kind: "train_authority_dimension", schemaVersion: 2, trains: [] }
	]), { dimensions: [{ dimensionId: "overworld", graph: {}, stations: [], trains: [] }], nextTrainId: 2, portalTransfers: [] });
});
