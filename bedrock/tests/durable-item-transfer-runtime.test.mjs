import assert from "node:assert/strict";
import test from "node:test";

import { DurableItemTransferRuntime } from "../behavior_pack/scripts/logistics/durable-item-transfer-runtime.js";
import { ItemPort } from "../behavior_pack/scripts/logistics/item-port.js";

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
		}
	};
}

function advance(runtime, predicate, maximumTicks = 100) {
	for (let tick = 0; tick < maximumTicks; tick++) {
		runtime.tick();
		if (predicate())
			return;
	}
	throw new Error("Transfer runtime did not reach the expected state");
}

test("DurableItemTransferRuntime commits the intent and escrow before delivery", () => {
	const storage = memoryStorage();
	const source = new ItemPort({ id: "source", size: 1, slots: [{ count: 4, typeId: "minecraft:iron_ingot" }] });
	const destination = new ItemPort({ id: "destination", size: 1 });
	const runtime = new DurableItemTransferRuntime({
		keyPrefix: "createbedrock:item_transfer_test",
		resolvePort: id => ({ destination, source })[id],
		storage,
		writesPerTick: 1
	});

	assert.equal(runtime.begin({ destination, id: "intent-first", maxCount: 3, source }).ok, true);
	advance(runtime, () => !runtime.diagnostics().waitingForCommit);
	assert.equal(runtime.snapshot()[0]?.state, "intent");
	assert.deepEqual(source.snapshot().slots, [{ count: 4, typeId: "minecraft:iron_ingot" }]);
	advance(runtime, () => runtime.snapshot()[0]?.state === "escrowed" && runtime.diagnostics().waitingForCommit);
	assert.deepEqual(source.snapshot().slots, [{ count: 1, typeId: "minecraft:iron_ingot" }]);
	assert.deepEqual(destination.snapshot().slots, [undefined]);
	advance(runtime, () => runtime.snapshot().length === 0);
	assert.deepEqual(destination.snapshot().slots, [{ count: 3, typeId: "minecraft:iron_ingot" }]);
});

test("DurableItemTransferRuntime restores a durable intent before its source is extracted", () => {
	const storage = memoryStorage();
	const source = new ItemPort({ id: "source", size: 1, slots: [{ count: 4, typeId: "minecraft:gold_ingot" }] });
	const firstRuntime = new DurableItemTransferRuntime({
		keyPrefix: "createbedrock:item_transfer_intent_restart",
		resolvePort: id => id === source.id ? source : undefined,
		storage,
		writesPerTick: 1
	});

	assert.equal(firstRuntime.begin({ destination: { id: "destination" }, id: "intent-restart", maxCount: 3, source }).ok, true);
	advance(firstRuntime, () => !firstRuntime.diagnostics().waitingForCommit);
	assert.equal(firstRuntime.snapshot()[0]?.state, "intent");
	assert.deepEqual(source.snapshot().slots, [{ count: 4, typeId: "minecraft:gold_ingot" }]);

	const restoredSource = new ItemPort({ id: "source", size: 1 });
	const restoredRuntime = new DurableItemTransferRuntime({
		keyPrefix: "createbedrock:item_transfer_intent_restart",
		resolvePort: id => ({ destination: new ItemPort({ id: "destination", size: 1 }), source: restoredSource })[id],
		storage,
		writesPerTick: 1
	});
	assert.deepEqual(restoredRuntime.restore(), { records: 1, warnings: [] });
	assert.deepEqual(restoredSource.snapshot().slots, [{ count: 4, typeId: "minecraft:gold_ingot" }]);
	advance(restoredRuntime, () => restoredRuntime.snapshot()[0]?.state === "escrowed");
	assert.deepEqual(restoredSource.snapshot().slots, [{ count: 1, typeId: "minecraft:gold_ingot" }]);
});

test("DurableItemTransferRuntime serializes transfers from one source port", () => {
	const source = new ItemPort({ id: "source", size: 1, slots: [{ count: 4, typeId: "minecraft:iron_ingot" }] });
	const destination = new ItemPort({ id: "destination", size: 1 });
	const runtime = new DurableItemTransferRuntime({
		keyPrefix: "createbedrock:item_transfer_source_busy",
		resolvePort: id => ({ destination, source })[id],
		storage: memoryStorage()
	});

	assert.equal(runtime.begin({ destination, id: "first", maxCount: 2, source }).ok, true);
	assert.deepEqual(runtime.begin({ destination, id: "second", maxCount: 2, source }), { ok: false, reason: "source_busy" });
});

test("DurableItemTransferRuntime restores a committed escrow and delivers it once", () => {
	const storage = memoryStorage();
	const source = new ItemPort({ id: "source", size: 1, slots: [{ count: 2, typeId: "minecraft:copper_ingot" }] });
	const firstRuntime = new DurableItemTransferRuntime({
		keyPrefix: "createbedrock:item_transfer_restart",
		resolvePort: id => id === source.id ? source : undefined,
		retryIntervalTicks: 1,
		storage,
		writesPerTick: 1
	});
	firstRuntime.begin({ destination: { id: "destination" }, id: "restart", maxCount: 2, source });
	advance(firstRuntime, () => firstRuntime.snapshot()[0]?.state === "escrowed" && !firstRuntime.diagnostics().waitingForCommit);

	const restoredSource = new ItemPort({ id: "source", size: 1 });
	const destination = new ItemPort({ id: "destination", size: 1 });
	const restoredRuntime = new DurableItemTransferRuntime({
		keyPrefix: "createbedrock:item_transfer_restart",
		resolvePort: id => ({ destination, source: restoredSource })[id],
		retryIntervalTicks: 1,
		storage,
		writesPerTick: 1
	});
	assert.deepEqual(restoredRuntime.restore(), { records: 1, warnings: [] });
	advance(restoredRuntime, () => restoredRuntime.snapshot().length === 0);
	assert.deepEqual(restoredSource.snapshot().slots, [undefined]);
	assert.deepEqual(destination.snapshot().slots, [{ count: 2, typeId: "minecraft:copper_ingot" }]);
});

test("DurableItemTransferRuntime restores managed port state after a committed transfer", () => {
	const storage = memoryStorage();
	const source = new ItemPort({ id: "source", size: 1, slots: [{ count: 3, typeId: "minecraft:andesite" }] });
	const destination = new ItemPort({ id: "destination", size: 1 });
	const firstRuntime = new DurableItemTransferRuntime({
		keyPrefix: "createbedrock:item_transfer_committed_port_state",
		resolvePort: id => ({ destination, source })[id],
		storage,
		writesPerTick: 1
	});
	firstRuntime.begin({ destination, id: "committed-port-state", maxCount: 2, source });
	advance(firstRuntime, () => firstRuntime.snapshot().length === 0 && !firstRuntime.diagnostics().waitingForCommit);

	const restoredSource = new ItemPort({ id: "source", size: 1 });
	const restoredDestination = new ItemPort({ id: "destination", size: 1 });
	const restoredRuntime = new DurableItemTransferRuntime({
		keyPrefix: "createbedrock:item_transfer_committed_port_state",
		resolvePort: id => ({ destination: restoredDestination, source: restoredSource })[id],
		storage,
		writesPerTick: 1
	});
	assert.deepEqual(restoredRuntime.restore(), { records: 0, warnings: [] });
	assert.deepEqual(restoredSource.snapshot().slots, [{ count: 1, typeId: "minecraft:andesite" }]);
	assert.deepEqual(restoredDestination.snapshot().slots, [{ count: 2, typeId: "minecraft:andesite" }]);
});

test("DurableItemTransferRuntime freezes a recovered transfer when its managed source is unavailable", () => {
	const storage = memoryStorage();
	const source = new ItemPort({ id: "source", size: 1, slots: [{ count: 2, typeId: "minecraft:zinc_ingot" }] });
	const firstRuntime = new DurableItemTransferRuntime({
		keyPrefix: "createbedrock:item_transfer_missing_source",
		resolvePort: id => id === source.id ? source : undefined,
		storage,
		writesPerTick: 1
	});
	firstRuntime.begin({ destination: { id: "destination" }, id: "missing-source", maxCount: 2, source });
	advance(firstRuntime, () => !firstRuntime.diagnostics().waitingForCommit);

	const unavailableRuntime = new DurableItemTransferRuntime({
		keyPrefix: "createbedrock:item_transfer_missing_source",
		resolvePort: () => undefined,
		storage,
		writesPerTick: 1
	});
	assert.deepEqual(unavailableRuntime.restore(), { records: 1, warnings: [] });
	assert.equal(unavailableRuntime.diagnostics().blockedPorts, 1);
	for (let tick = 0; tick < 5; tick++)
		unavailableRuntime.tick();
	assert.equal(unavailableRuntime.snapshot()[0]?.state, "intent");
});
