import assert from "node:assert/strict";
import test from "node:test";

import { ItemPort, itemStackFingerprint } from "../behavior_pack/scripts/logistics/item-port.js";
import { ItemTransferJournal } from "../behavior_pack/scripts/logistics/item-transfer-journal.js";

function ports(...ports) {
	return id => ports.find(port => port.id === id);
}

test("ItemPort reserves and extracts one compatible item type without merging custom data", () => {
	const port = new ItemPort({
		id: "source",
		size: 3,
		slots: [
			{ count: 4, metadata: { quality: "a" }, typeId: "minecraft:iron_ingot" },
			{ count: 3, metadata: { quality: "b" }, typeId: "minecraft:iron_ingot" }
		]
	});
	const reservation = port.reserve({ maxCount: 6 });
	assert.equal(reservation.item.count, 4);
	assert.deepEqual(port.extract(reservation), { count: 4, metadata: { quality: "a" }, typeId: "minecraft:iron_ingot" });
	assert.equal(port.snapshot().slots[0], undefined);
	assert.equal(itemStackFingerprint({ count: 1, metadata: { quality: "a" }, typeId: "minecraft:iron_ingot" }), itemStackFingerprint(reservation.item));
});

test("ItemTransferJournal delivers escrowed items exactly once across retries", () => {
	const source = new ItemPort({ id: "source", size: 1, slots: [{ count: 10, typeId: "minecraft:cobblestone" }] });
	const destination = new ItemPort({ id: "destination", size: 1, maxStackSize: 64 });
	const journal = new ItemTransferJournal();
	assert.equal(journal.begin({ destination, id: "transfer:1", maxCount: 6, source }).ok, true);
	assert.deepEqual(journal.settle("transfer:1", ports(source, destination)), { ok: true, state: "committed" });
	assert.deepEqual(source.snapshot().slots, [{ count: 4, typeId: "minecraft:cobblestone" }]);
	assert.deepEqual(destination.snapshot().slots, [{ count: 6, typeId: "minecraft:cobblestone" }]);
	assert.deepEqual(journal.settle("transfer:1", ports(source, destination)), { ok: false, reason: "unknown_transfer" });
});

test("ItemTransferJournal retains escrow when full and completes after a restart", () => {
	const source = new ItemPort({ id: "source", size: 1, slots: [{ count: 8, typeId: "minecraft:iron_ingot" }] });
	const destination = new ItemPort({ id: "destination", size: 1, maxStackSize: 4, slots: [{ count: 4, typeId: "minecraft:dirt" }] });
	const journal = new ItemTransferJournal();
	journal.begin({ destination, id: "transfer:2", maxCount: 5, source });
	assert.deepEqual(journal.settle("transfer:2", ports(source, destination)), { ok: false, reason: "destination_full", state: "escrowed" });
	const restored = new ItemTransferJournal();
	restored.restore(journal.snapshot());
	destination.extract(destination.reserve());
	assert.deepEqual(restored.settle("transfer:2", ports(source, destination)), { ok: false, reason: "destination_full", state: "escrowed" });
	assert.deepEqual(destination.snapshot().slots, [{ count: 4, typeId: "minecraft:iron_ingot" }]);
	destination.extract(destination.reserve());
	assert.deepEqual(restored.settle("transfer:2", ports(source, destination)), { ok: true, state: "committed" });
	assert.deepEqual(destination.snapshot().slots, [{ count: 1, typeId: "minecraft:iron_ingot" }]);
	assert.deepEqual(source.snapshot().slots, [{ count: 3, typeId: "minecraft:iron_ingot" }]);
});

test("ItemPort snapshots retain extraction and insertion receipts for restart-safe retries", () => {
	const source = new ItemPort({ id: "source", size: 1, slots: [{ count: 2, typeId: "minecraft:copper_ingot" }] });
	const reservation = source.reserve();
	source.extract(reservation, { receiptId: "transaction:extract" });
	const restored = new ItemPort({ id: "source", size: 1 });
	restored.restore(source.snapshot());
	assert.deepEqual(restored.extract(reservation, { receiptId: "transaction:extract" }), { count: 2, typeId: "minecraft:copper_ingot" });
});

test("ItemTransferJournal cancels a stale intent without removing source items", () => {
	const source = new ItemPort({ id: "source", size: 2, slots: [{ count: 3, typeId: "minecraft:gold_ingot" }] });
	const destination = new ItemPort({ id: "destination", size: 1 });
	const journal = new ItemTransferJournal();
	journal.begin({ destination, id: "transfer:3", maxCount: 2, source });
	source.insert({ count: 1, typeId: "minecraft:stone" });
	const result = journal.settle("transfer:3", ports(source, destination));
	assert.equal(result.reason, "source_changed");
	assert.deepEqual(source.snapshot().slots[0], { count: 3, typeId: "minecraft:gold_ingot" });
});

test("ItemTransferJournal retains a durable intent when a source adapter reports uncertain state", () => {
	const source = {
		id: "source",
		extract() {
			const error = new Error("container could not be verified");
			error.transactionState = "uncertain";
			throw error;
		},
		reserve() {
			return {
				item: { count: 1, typeId: "minecraft:iron_ingot" },
				portId: "source",
				revision: 0,
				slots: [{ count: 1, slot: 0 }]
			};
		}
	};
	const destination = { id: "destination", insert() {} };
	const journal = new ItemTransferJournal();
	journal.begin({ destination, id: "transfer:uncertain", source });
	assert.equal(journal.settle("transfer:uncertain", ports(source, destination)).reason, "source_uncertain");
	assert.equal(journal.snapshot()[0].state, "intent");
});
