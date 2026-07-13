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

function depotSlots(network, id) {
	return network.snapshot().find(record => record.kind === "depot" && record.port.id === id)?.port.slots;
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
	assert.deepEqual(restored.restore(), { belts: 0, chutes: 0, depots: 2, funnels: 0, transfers: 1, transports: 0, warnings: [] });
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

test("DepotNetwork carries one persistent transport record along a directed belt", () => {
	const network = createNetwork(memoryStorage(), "createbedrock:belt_transport");
	const source = network.createDepot({ dimensionId: "minecraft:overworld", location: { x: 0, y: 64, z: 0 } });
	const destination = network.createDepot({ dimensionId: "minecraft:overworld", location: { x: 8, y: 64, z: 0 } });
	network.insert(source, { count: 2, typeId: "minecraft:zinc_ingot" });
	network.createBelt({ destinationId: destination, id: "belt:0", length: 8, sourceId: source, speed: 128 });
	advance(network, () => network.diagnostics().transports === 0 && !network.diagnostics().waitingForCommit && depotSlots(network, destination)?.[0]?.count === 2);
	assert.deepEqual(network.extract(source), undefined);
	assert.deepEqual(network.extract(destination), { count: 2, typeId: "minecraft:zinc_ingot" });
	assert.equal(network.removeBelt("belt:0"), true);
});

test("DepotNetwork restores an in-flight belt record and keeps it when the target is full", () => {
	const storage = memoryStorage();
	const first = createNetwork(storage, "createbedrock:belt_restart");
	const source = first.createDepot({ dimensionId: "minecraft:overworld", location: { x: 0, y: 64, z: 0 } });
	const destination = first.createDepot({ dimensionId: "minecraft:overworld", location: { x: 4, y: 64, z: 0 }, maxStackSize: 1 });
	first.insert(source, { count: 1, typeId: "minecraft:brass_ingot" });
	first.insert(destination, { count: 1, typeId: "minecraft:dirt" });
	first.createBelt({ destinationId: destination, id: "belt:restart", length: 4, sourceId: source, speed: 256 });
	advance(first, () => first.diagnostics().transports === 1 && !first.diagnostics().waitingForCommit);

	const restored = createNetwork(storage, "createbedrock:belt_restart");
	assert.deepEqual(restored.restore(), { belts: 1, chutes: 0, depots: 2, funnels: 0, transfers: 0, transports: 1, warnings: [] });
	assert.throws(() => restored.removeBelt("belt:restart"), /active transport/);
	assert.deepEqual(restored.extract(destination), { count: 1, typeId: "minecraft:dirt" });
	advance(restored, () => restored.diagnostics().transports === 0 && !restored.diagnostics().waitingForCommit);
	assert.deepEqual(restored.extract(destination), { count: 1, typeId: "minecraft:brass_ingot" });
});

test("DepotNetwork returns a transport to its source when the belt reverses", () => {
	const network = createNetwork(memoryStorage(), "createbedrock:belt_reverse");
	const source = network.createDepot({ dimensionId: "minecraft:overworld", location: { x: 0, y: 64, z: 0 } });
	const destination = network.createDepot({ dimensionId: "minecraft:overworld", location: { x: 4, y: 64, z: 0 } });
	network.insert(source, { count: 1, typeId: "minecraft:andesite" });
	network.createBelt({ destinationId: destination, id: "belt:reverse", length: 4, sourceId: source, speed: 64 });
	advance(network, () => network.snapshot().some(record => record.kind === "transport" && record.progress > 0));
	network.setBeltSpeed("belt:reverse", -256);
	advance(network, () => network.diagnostics().transports === 0 && !network.diagnostics().waitingForCommit);
	assert.deepEqual(network.extract(source), { count: 1, typeId: "minecraft:andesite" });
	assert.deepEqual(network.extract(destination), undefined);
});

test("DepotNetwork funnels filter items and honor their lock state", () => {
	const network = createNetwork(memoryStorage(), "createbedrock:funnel_transfer");
	const source = network.createDepot({ dimensionId: "minecraft:overworld", location: { x: 0, y: 64, z: 0 }, size: 2 });
	const destination = network.createDepot({ dimensionId: "minecraft:overworld", location: { x: 1, y: 64, z: 0 } });
	network.insert(source, { count: 1, typeId: "minecraft:dirt" });
	network.insert(source, { count: 2, typeId: "minecraft:iron_ingot" });
	network.createFunnel({ destinationId: destination, filter: { typeIds: ["minecraft:iron_ingot"] }, id: "funnel:0", locked: true, sourceId: source });
	advance(network, () => !network.diagnostics().waitingForCommit, 20);
	assert.deepEqual(depotSlots(network, destination), [undefined]);
	network.setFunnelLocked("funnel:0", false);
	advance(network, () => network.diagnostics().transfers === 0 && !network.diagnostics().waitingForCommit && depotSlots(network, destination)?.[0]?.typeId === "minecraft:iron_ingot");
	assert.deepEqual(network.extract(destination), { count: 2, typeId: "minecraft:iron_ingot" });
	assert.deepEqual(network.extract(source), { count: 1, typeId: "minecraft:dirt" });
});

test("DepotNetwork funnels without a filter transfer the first available item", () => {
	const network = createNetwork(memoryStorage(), "createbedrock:funnel_unfiltered");
	const source = network.createDepot({ dimensionId: "minecraft:overworld", location: { x: 0, y: 64, z: 0 } });
	const destination = network.createDepot({ dimensionId: "minecraft:overworld", location: { x: 1, y: 64, z: 0 } });
	network.insert(source, { count: 1, typeId: "minecraft:copper_ingot" });
	network.createFunnel({ destinationId: destination, id: "funnel:unfiltered", sourceId: source });
	advance(network, () => network.diagnostics().transfers === 0 && !network.diagnostics().waitingForCommit && depotSlots(network, destination)?.[0]?.typeId === "minecraft:copper_ingot");
	assert.deepEqual(network.extract(destination), { count: 1, typeId: "minecraft:copper_ingot" });
});

test("DepotNetwork chutes transfer items downward through the same recovery journal", () => {
	const network = createNetwork(memoryStorage(), "createbedrock:chute_transfer");
	const source = network.createDepot({ dimensionId: "minecraft:overworld", location: { x: 0, y: 65, z: 0 } });
	const destination = network.createDepot({ dimensionId: "minecraft:overworld", location: { x: 0, y: 63, z: 0 } });
	network.insert(source, { count: 3, typeId: "minecraft:andesite" });
	network.createChute({ destinationId: destination, id: "chute:0", sourceId: source });
	advance(network, () => network.diagnostics().transfers === 0 && !network.diagnostics().waitingForCommit && depotSlots(network, destination)?.[0]?.count === 3);
	assert.deepEqual(network.extract(source), undefined);
	assert.deepEqual(network.extract(destination), { count: 3, typeId: "minecraft:andesite" });
});
