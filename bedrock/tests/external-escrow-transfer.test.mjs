import assert from "node:assert/strict";
import test from "node:test";

import { ExternalEscrowTransferRuntime } from "../behavior_pack/scripts/logistics/external-escrow-transfer.js";

function clone(value) {
	return value && JSON.parse(JSON.stringify(value));
}

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

class FakeContainer {
	#slots;

	constructor(size, slots = []) {
		this.#slots = Array.from({ length: size }, (_, slot) => clone(slots[slot]));
	}

	get size() {
		return this.#slots.length;
	}

	getItem(slot) {
		return clone(this.#slots[slot]);
	}

	moveItem(fromSlot, toSlot, target) {
		if (!this.#slots[fromSlot])
			throw new Error("source slot is empty");
		if (target.getItem(toSlot))
			throw new Error("target slot is occupied");
		target.setItem(toSlot, this.#slots[fromSlot]);
		this.#slots[fromSlot] = undefined;
	}

	setItem(slot, item) {
		this.#slots[slot] = clone(item);
	}
}

function advance(runtime, predicate, maximumTicks = 100) {
	for (let tick = 0; tick < maximumTicks; tick++) {
		runtime.tick();
		if (predicate())
			return;
	}
	throw new Error("External escrow runtime did not reach the expected state");
}

function createRuntime({ escrows = new Map(), ports, storage, keyPrefix = "createbedrock:external_escrow_test" }) {
	return new ExternalEscrowTransferRuntime({
		createEscrow({ id }) {
			const escrow = { container: new FakeContainer(1), id: `escrow:${id}` };
			escrows.set(escrow.id, escrow);
			return escrow;
		},
		decodeStack(stack) {
			return { count: stack.amount, typeId: stack.typeId };
		},
		destroyEscrow(id) {
			escrows.delete(id);
		},
		keyPrefix,
		resolveEscrow: id => escrows.get(id),
		resolvePort: id => ports.get(id),
		storage,
		writesPerTick: 1
	});
}

function port(id, container, slot = 0) {
	return { container, id, slot };
}

test("ExternalEscrowTransferRuntime moves one complete source slot through private escrow", () => {
	const storage = memoryStorage();
	const escrows = new Map();
	const source = port("source", new FakeContainer(1, [{ amount: 3, typeId: "minecraft:iron_ingot" }]));
	const destination = port("destination", new FakeContainer(1));
	const ports = new Map([[source.id, source], [destination.id, destination]]);
	const runtime = createRuntime({ escrows, ports, storage });

	assert.equal(runtime.begin({ destination, id: "iron", source }).ok, true);
	advance(runtime, () => runtime.snapshot().length === 0 && !runtime.diagnostics().waitingForCommit);
	assert.equal(source.container.getItem(0), undefined);
	assert.deepEqual(destination.container.getItem(0), { amount: 3, typeId: "minecraft:iron_ingot" });
	assert.equal(escrows.size, 0);
});

test("ExternalEscrowTransferRuntime resumes a persisted escrow item after restart", () => {
	const storage = memoryStorage();
	const escrows = new Map();
	const source = port("source", new FakeContainer(1, [{ amount: 2, typeId: "minecraft:copper_ingot" }]));
	const destination = port("destination", new FakeContainer(1));
	const ports = new Map([[source.id, source], [destination.id, destination]]);
	const first = createRuntime({ escrows, keyPrefix: "createbedrock:external_escrow_restart", ports, storage });
	first.begin({ destination, id: "restart", source });
	advance(first, () => first.snapshot()[0]?.state === "escrowed" && !first.diagnostics().waitingForCommit);
	assert.equal(source.container.getItem(0), undefined);
	assert.deepEqual(escrows.get("escrow:restart")?.container.getItem(0), { amount: 2, typeId: "minecraft:copper_ingot" });

	const restored = createRuntime({ escrows, keyPrefix: "createbedrock:external_escrow_restart", ports, storage });
	assert.deepEqual(restored.restore(), { records: 1, warnings: [] });
	advance(restored, () => restored.snapshot().length === 0 && !restored.diagnostics().waitingForCommit);
	assert.deepEqual(destination.container.getItem(0), { amount: 2, typeId: "minecraft:copper_ingot" });
	assert.equal(escrows.size, 0);
});

test("ExternalEscrowTransferRuntime recognizes a native delivery completed before the journal commit", () => {
	const storage = memoryStorage();
	const escrows = new Map();
	const source = port("source", new FakeContainer(1, [{ amount: 1, typeId: "minecraft:zinc_ingot" }]));
	const destination = port("destination", new FakeContainer(1));
	const ports = new Map([[source.id, source], [destination.id, destination]]);
	const first = createRuntime({ escrows, keyPrefix: "createbedrock:external_escrow_delivery_restart", ports, storage });
	first.begin({ destination, id: "delivery-restart", source });
	advance(first, () => first.snapshot()[0]?.state === "escrowed" && !first.diagnostics().waitingForCommit);
	escrows.get("escrow:delivery-restart").container.moveItem(0, 0, destination.container);

	const restored = createRuntime({ escrows, keyPrefix: "createbedrock:external_escrow_delivery_restart", ports, storage });
	assert.deepEqual(restored.restore(), { records: 1, warnings: [] });
	advance(restored, () => restored.snapshot().length === 0 && !restored.diagnostics().waitingForCommit);
	assert.deepEqual(destination.container.getItem(0), { amount: 1, typeId: "minecraft:zinc_ingot" });
	assert.equal(escrows.size, 0);
});

test("ExternalEscrowTransferRuntime retains escrow while its planned destination is occupied", () => {
	const storage = memoryStorage();
	const source = port("source", new FakeContainer(1, [{ amount: 1, typeId: "minecraft:andesite" }]));
	const destination = port("destination", new FakeContainer(1));
	const ports = new Map([[source.id, source], [destination.id, destination]]);
	const escrows = new Map();
	const runtime = createRuntime({ escrows, ports, storage });
	assert.equal(runtime.begin({ destination, id: "full-destination", source }).ok, true);
	advance(runtime, () => runtime.snapshot()[0]?.state === "escrowed" && !runtime.diagnostics().waitingForCommit);
	destination.container.setItem(0, { amount: 1, typeId: "minecraft:dirt" });
	advance(runtime, () => runtime.diagnostics().cooldownTicks > 0);
	assert.equal(runtime.snapshot()[0]?.state, "escrowed");
	assert.deepEqual(escrows.get("escrow:full-destination")?.container.getItem(0), { amount: 1, typeId: "minecraft:andesite" });
});

test("ExternalEscrowTransferRuntime waits for an unloaded endpoint without cancelling its intent", () => {
	const storage = memoryStorage();
	const source = port("source", new FakeContainer(1, [{ amount: 1, typeId: "minecraft:brass_ingot" }]));
	const destination = port("destination", new FakeContainer(1));
	const ports = new Map([[source.id, source], [destination.id, destination]]);
	const escrows = new Map();
	const runtime = createRuntime({ escrows, ports, storage });
	runtime.begin({ destination, id: "unloaded-source", source });
	advance(runtime, () => !runtime.diagnostics().waitingForCommit);
	ports.delete(source.id);
	advance(runtime, () => runtime.diagnostics().cooldownTicks > 0);
	assert.equal(runtime.diagnostics().frozen, false);
	assert.equal(runtime.snapshot()[0]?.state, "intent");
	ports.set(source.id, source);
	advance(runtime, () => runtime.snapshot().length === 0 && !runtime.diagnostics().waitingForCommit);
	assert.deepEqual(destination.container.getItem(0), { amount: 1, typeId: "minecraft:brass_ingot" });
});
