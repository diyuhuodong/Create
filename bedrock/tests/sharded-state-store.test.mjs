import assert from "node:assert/strict";
import test from "node:test";

import { ShardedStateStore } from "../behavior_pack/scripts/kernel/sharded-state-store.js";

function memoryStorage() {
	const values = new Map();
	return {
		delete(key) {
			values.delete(key);
		},
		get(key) {
			return values.get(key);
		},
		set(key, value) {
			values.set(key, value);
		},
		values
	};
}

function drain(store) {
	for (let index = 0; index < 100; index++) {
		store.tick();
		if (store.diagnostics().pendingActions === 0 && !store.diagnostics().dirty)
			return;
	}
	throw new Error("Store did not drain");
}

test("ShardedStateStore commits small deterministic shards through a root-pointer switch", () => {
	const storage = memoryStorage();
	const store = new ShardedStateStore({
		keyPrefix: "createbedrock:test_state",
		partitionFor: record => record.partition,
		storage,
		writesPerTick: 1
	});

	store.request([
		{ id: "b", partition: "overworld:1" },
		{ id: "a", partition: "overworld:0" },
		{ id: "c", partition: "overworld:0" }
	]);
	drain(store);
	assert.equal(store.diagnostics().activeGeneration, 0);
	assert.equal(store.diagnostics().activeIndexPages, 1);
	assert.equal(store.diagnostics().activeShards, 2);
	assert.ok(store.diagnostics().activeBytes > 0);
	assert.equal(store.diagnostics().commits, 1);
	assert.deepEqual(store.read(), {
		records: [
			{ id: "a", partition: "overworld:0" },
			{ id: "c", partition: "overworld:0" },
			{ id: "b", partition: "overworld:1" }
		],
		warnings: []
	});
});

test("ShardedStateStore flips generations and keeps the prior committed root intact after a write failure", () => {
	const storage = memoryStorage();
	const store = new ShardedStateStore({
		keyPrefix: "createbedrock:retry_state",
		partitionFor: record => record.partition,
		storage
	});
	store.request([{ id: "old", partition: "p" }]);
	drain(store);

	let failed = false;
	const originalSet = storage.set.bind(storage);
	storage.set = (key, value) => {
			if (!failed && key.includes("_g1_s")) {
				failed = true;
				throw new Error("simulated write failure");
			}
			originalSet(key, value);
		};
	store.request([{ id: "new", partition: "p" }]);
	store.tick();
	assert.deepEqual(store.read()?.records, [{ id: "old", partition: "p" }]);
	drain(store);
	assert.deepEqual(store.read()?.records, [{ id: "new", partition: "p" }]);
	assert.equal(store.diagnostics().activeGeneration, 1);
	assert.equal(store.diagnostics().failures, 1);
});

test("ShardedStateStore splits payloads, rejects oversized records, and isolates corrupt shards", () => {
	const storage = memoryStorage();
	const store = new ShardedStateStore({
		keyPrefix: "createbedrock:split_state",
		maxShardCharacters: 180,
		partitionFor: record => record.partition,
		storage
	});
	store.request([
		{ id: "one", partition: "p", value: "x".repeat(40) },
		{ id: "two", partition: "p", value: "y".repeat(40) }
	]);
	drain(store);
	assert.ok([...storage.values.keys()].filter(key => key.includes("_s")).length >= 2);

	storage.set("createbedrock:split_state_g0_s0", "not json");
	const restored = store.read();
	assert.equal(restored.records.length, 1);
	assert.equal(restored.warnings.length, 1);
	store.request([{ partition: "p", value: "z".repeat(500) }]);
	assert.equal(store.tick(), false);
	assert.match(store.diagnostics().lastError, /exceeds the shard budget/);
});
