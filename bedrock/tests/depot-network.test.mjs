import assert from "node:assert/strict";
import test from "node:test";

import { depotId, DepotNetwork } from "../behavior_pack/scripts/logistics/depot-network.js";

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

function advance(network, predicate, maximumTicks = 150) {
	for (let tick = 0; tick < maximumTicks; tick++) {
		network.tick();
		if (predicate())
			return;
	}
	throw new Error("Depot network did not reach the expected state");
}

function createNetwork(storage, keyPrefix = "createbedrock:depot_test") {
	return new DepotNetwork({ keyPrefix, retryIntervalTicks: 1, storage, writesPerTick: 1 });
}

test("DepotNetwork moves an item through a single atomic persisted state domain", () => {
	const network = createNetwork(memoryStorage());
	const source = network.createDepot({ dimensionId: "minecraft:overworld", location: { x: 1, y: 64, z: 1 } });
	const destination = network.createDepot({ dimensionId: "minecraft:overworld", location: { x: 2, y: 64, z: 1 } });
	network.insert(source, { count: 5, typeId: "minecraft:iron_ingot" });
	assert.equal(network.beginTransfer({ destinationId: destination, id: "depot-transfer", maxCount: 3, sourceId: source }).ok, true);
	advance(network, () => network.diagnostics().transfers === 0 && !network.diagnostics().waitingForCommit);
	assert.deepEqual(network.extract(source), { count: 2, typeId: "minecraft:iron_ingot" });
	assert.deepEqual(network.extract(destination), { count: 3, typeId: "minecraft:iron_ingot" });
});

test("DepotNetwork restarts from an escrow checkpoint without duplicating depot items", () => {
	const storage = memoryStorage();
	const first = createNetwork(storage, "createbedrock:depot_restart");
	const source = first.createDepot({ dimensionId: "minecraft:overworld", location: { x: 0, y: 64, z: 0 } });
	const destination = first.createDepot({ dimensionId: "minecraft:overworld", location: { x: 17, y: 64, z: 0 }, maxStackSize: 4 });
	first.insert(source, { count: 4, typeId: "minecraft:copper_ingot" });
	first.insert(destination, { count: 4, typeId: "minecraft:dirt" });
	first.beginTransfer({ destinationId: destination, id: "restart-transfer", maxCount: 4, sourceId: source });
	advance(first, () => first.snapshot().some(record => record.kind === "transfer" && record.state === "escrowed") && !first.diagnostics().waitingForCommit);

	const restored = createNetwork(storage, "createbedrock:depot_restart");
	assert.deepEqual(restored.restore(), { depots: 2, transfers: 1, warnings: [] });
	assert.deepEqual(restored.extract(destination), { count: 4, typeId: "minecraft:dirt" });
	advance(restored, () => restored.diagnostics().transfers === 0 && !restored.diagnostics().waitingForCommit);
	assert.deepEqual(restored.extract(source), undefined);
	assert.deepEqual(restored.extract(destination), { count: 4, typeId: "minecraft:copper_ingot" });
});

test("DepotNetwork retains escrow while the destination is full and protects active depots", () => {
	const network = createNetwork(memoryStorage(), "createbedrock:depot_full");
	const source = network.createDepot({ dimensionId: "minecraft:overworld", location: { x: 0, y: 64, z: 0 } });
	const destination = network.createDepot({ dimensionId: "minecraft:overworld", location: { x: 1, y: 64, z: 0 }, maxStackSize: 1 });
	network.insert(source, { count: 1, typeId: "minecraft:gold_ingot" });
	network.insert(destination, { count: 1, typeId: "minecraft:dirt" });
	network.beginTransfer({ destinationId: destination, id: "full-transfer", maxCount: 1, sourceId: source });
	advance(network, () => network.diagnostics().transfers === 1 && !network.diagnostics().waitingForCommit);
	assert.throws(() => network.removeDepot(destination), /active item transfer/);
	assert.deepEqual(network.extract(destination), { count: 1, typeId: "minecraft:dirt" });
	advance(network, () => network.diagnostics().transfers === 0 && !network.diagnostics().waitingForCommit);
	assert.deepEqual(network.extract(destination), { count: 1, typeId: "minecraft:gold_ingot" });
	assert.equal(network.canRemoveDepot(destination), true);
});

test("depotId is dimension-aware and only accepts block coordinates", () => {
	assert.notEqual(depotId("minecraft:overworld", { x: 0, y: 64, z: 0 }), depotId("minecraft:the_nether", { x: 0, y: 64, z: 0 }));
	assert.throws(() => depotId("minecraft:overworld", { x: 0.5, y: 64, z: 0 }), /integer/);
});
