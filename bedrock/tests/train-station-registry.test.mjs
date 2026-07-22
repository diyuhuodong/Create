import assert from "node:assert/strict";
import test from "node:test";

import { TrainStationRegistry } from "../behavior_pack/scripts/trains/train-station-registry.js";

function station(id, name, nodeId = id) {
	return { id, location: { x: 0, y: 64, z: 0 }, name, nodeId, powered: false };
}

test("station registry resolves exact names and deterministic wildcard filters", () => {
	const registry = new TrainStationRegistry("minecraft:overworld");
	assert.equal(registry.upsert(station("station:a", "Andesite Works", "a")).ok, true);
	assert.equal(registry.upsert(station("station:b", "Brass Depot", "b")).ok, true);
	assert.equal(registry.resolve("Brass Depot", true), "b");
	assert.equal(registry.resolve("*Works"), "a");
	assert.equal(registry.resolve("depot"), "b");
	assert.equal(registry.upsert(station("station:c", "Brass Depot", "c")).reason, "duplicate_name");
});

test("station registry uses revision CAS and fail-closed restore", () => {
	const registry = new TrainStationRegistry("minecraft:overworld");
	const initial = registry.upsert(station("station:a", "Central", "a")).station;
	assert.equal(registry.upsert({ ...initial, name: "Changed" }, 2).reason, "revision_conflict");
	assert.equal(registry.upsert({ ...initial, name: "Changed" }, 0).station.revision, 1);
	const restored = new TrainStationRegistry("minecraft:overworld");
	restored.restore(registry.snapshot());
	assert.equal(restored.resolve("Changed", true), "a");
	assert.throws(() => new TrainStationRegistry("minecraft:nether").restore(registry.snapshot()), /cross-dimension/);
});
