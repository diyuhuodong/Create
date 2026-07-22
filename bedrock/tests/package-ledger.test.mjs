import assert from "node:assert/strict";
import test from "node:test";

import { MAX_PACKAGE_SLOTS, PackageLedger } from "../behavior_pack/scripts/logistics/package-ledger.js";

function contents() {
	return [{ count: 3, typeId: "createbedrock:andesite_alloy" }];
}

test("PackageLedger preserves bounded package contents through a durable transfer", () => {
	const ledger = new PackageLedger();
	const created = ledger.create({ address: "Depot A", contents: contents(), owner: { id: "packager:a", kind: "port" } });
	const intent = ledger.beginTransfer(created.id, { expectedRevision: 0, receiptId: "delivery:1", to: { id: "frogport:b", kind: "port" } });
	assert.equal(intent.ok, true);
	assert.equal(intent.record.owner.kind, "escrow");
	assert.deepEqual(intent.record.contents, contents());
	const delivered = ledger.completeTransfer(created.id, { receiptId: "delivery:1" });
	assert.equal(delivered.ok, true);
	assert.deepEqual(delivered.record.owner, { id: "frogport:b", kind: "port" });
	assert.deepEqual(delivered.record.contents, contents());
});

test("PackageLedger uses revision and receipts to reject conflicts without duplicating a package", () => {
	const ledger = new PackageLedger();
	const created = ledger.create({ contents: contents() });
	assert.deepEqual(ledger.beginTransfer(created.id, { expectedRevision: 1, receiptId: "delivery:1", to: { id: "port", kind: "port" } }), { ok: false, reason: "stale_revision" });
	ledger.beginTransfer(created.id, { expectedRevision: 0, receiptId: "delivery:1", to: { id: "port", kind: "port" } });
	assert.equal(ledger.beginTransfer(created.id, { expectedRevision: 1, receiptId: "delivery:1", to: { id: "other", kind: "port" } }).replay, true);
	assert.equal(ledger.beginTransfer(created.id, { expectedRevision: 1, receiptId: "delivery:2", to: { id: "other", kind: "port" } }).reason, "transfer_active");
	assert.equal(ledger.completeTransfer(created.id, { receiptId: "delivery:1" }).ok, true);
	assert.equal(ledger.completeTransfer(created.id, { receiptId: "delivery:1" }).replay, true);
});

test("PackageLedger aborts a committed intent back to its durable source for retry", () => {
	const ledger = new PackageLedger();
	const created = ledger.create({ contents: contents(), owner: { id: "source", kind: "port" } });
	ledger.beginTransfer(created.id, { expectedRevision: 0, receiptId: "delivery:abort", to: { id: "offline", kind: "port" } });
	const aborted = ledger.abortTransfer(created.id, { receiptId: "delivery:abort" });
	assert.equal(aborted.ok, true);
	assert.deepEqual(aborted.record.owner, { id: "source", kind: "port" });
	assert.equal(ledger.abortTransfer(created.id, { receiptId: "delivery:abort" }).replay, true);
});

test("PackageLedger resumes exactly one in-flight delivery after snapshot restore", () => {
	const ledger = new PackageLedger();
	const created = ledger.create({ contents: contents(), owner: { id: "source", kind: "port" } });
	ledger.beginTransfer(created.id, { expectedRevision: 0, receiptId: "delivery:restart", to: { id: "target", kind: "port" } });
	const restored = new PackageLedger();
	restored.restore(ledger.snapshot());
	assert.equal(restored.completeTransfer(created.id, { receiptId: "delivery:restart" }).ok, true);
	assert.equal(restored.completeTransfer(created.id, { receiptId: "delivery:restart" }).replay, true);
	assert.equal(restored.snapshot().records.length, 1);
});

test("PackageLedger restores only valid, nine-slot-or-smaller package records", () => {
	const ledger = new PackageLedger();
	ledger.create({ contents: contents() });
	const restored = new PackageLedger();
	restored.restore(ledger.snapshot());
	assert.deepEqual(restored.get("package:1").contents, contents());
	assert.throws(() => ledger.create({ contents: Array.from({ length: MAX_PACKAGE_SLOTS + 1 }, () => ({ count: 1, typeId: "minecraft:stone" })) }), /at most/);
});
