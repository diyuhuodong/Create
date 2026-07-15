import assert from "node:assert/strict";
import test from "node:test";

import { depotId, DepotNetwork } from "../behavior_pack/scripts/logistics/depot-network.js";
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

function clone(value) {
	return value && JSON.parse(JSON.stringify(value));
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

function externalDepositCallbacks({ escrows, source }) {
	return {
		decodeStack(stack) {
			return clone(stack);
		},
		resolveEscrow(record) {
			return escrows.get(record.escrowId);
		},
		resolveSource() {
			return { container: source, slot: 0 };
		}
	};
}

function externalWithdrawalCallbacks({ escrows, target }) {
	return {
		createStack(stack) {
			return clone(stack);
		},
		decodeStack(stack) {
			return clone(stack);
		},
		resolveEscrow(record) {
			return escrows.get(record.escrowId);
		},
		resolveTarget() {
			return { container: target, slot: 0 };
		}
	};
}

function advanceExternalDeposit(network, callbacks, predicate, maximumTicks = 200) {
	for (let tick = 0; tick < maximumTicks; tick++) {
		if (!network.tick())
			network.tickExternalDeposits(callbacks);
		if (predicate())
			return;
	}
	throw new Error("External depot deposit did not reach the expected state");
}

function advanceExternalWithdrawal(network, callbacks, predicate, maximumTicks = 200) {
	for (let tick = 0; tick < maximumTicks; tick++) {
		if (!network.tick())
			network.tickExternalWithdrawals(callbacks);
		if (predicate())
			return;
	}
	throw new Error("External depot withdrawal did not reach the expected state");
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

test("DepotNetwork recovers an in-flight belt transport through machine-owned managed ports", () => {
	const storage = memoryStorage();
	const sourcePort = new ItemPort({ id: "crusher:source:output", size: 1 });
	const destinationPort = new ItemPort({ id: "crusher:destination:input", size: 1 });
	const sourceId = "crusher-controller:source:output";
	const destinationId = "crusher-controller:destination:input";
	let sourceCheckpoints = 0;
	let destinationCheckpoints = 0;
	const network = createNetwork(storage, "createbedrock:managed_belt_ports");
	network.registerExternalManagedDepot({
		dimensionId: "minecraft:overworld",
		id: sourceId,
		location: { x: 0, y: 64, z: 0 },
		onPortMutation() {
			sourceCheckpoints++;
		},
		port: sourcePort,
		role: "output"
	});
	network.registerExternalManagedDepot({
		dimensionId: "minecraft:overworld",
		id: destinationId,
		location: { x: 3, y: 64, z: 0 },
		onPortMutation() {
			destinationCheckpoints++;
		},
		port: destinationPort,
		role: "input"
	});
	network.createBelt({ destinationId, id: "managed-belt", length: 3, sourceId, speed: 96 });
	assert.deepEqual(sourcePort.insert({ count: 1, typeId: "minecraft:iron_ore" }).accepted, {
		count: 1,
		typeId: "minecraft:iron_ore"
	});
	advance(network, () => network.diagnostics().transports === 1 && !network.diagnostics().waitingForCommit);
	assert.equal(sourceCheckpoints, 1);
	const persistedEndpoint = network.snapshot().find(record => record.kind === "external_managed_depot" && record.id === sourceId);
	assert.deepEqual(persistedEndpoint, {
		dimensionId: "minecraft:overworld",
		id: sourceId,
		kind: "external_managed_depot",
		location: { x: 0, y: 64, z: 0 },
		logistics: { acceptsRequests: true, address: "", networkId: "default", revision: 0 },
		role: "output"
	});

	// The machine owner snapshots the two ports. DepotNetwork restores only its
	// endpoints and transport record, then resumes when the owner reattaches.
	const sourceSnapshot = sourcePort.snapshot();
	const destinationSnapshot = destinationPort.snapshot();
	const restored = createNetwork(storage, "createbedrock:managed_belt_ports");
	assert.equal(restored.restore().transports, 1);
	const restoredSource = new ItemPort({ id: "crusher:source:output", size: 1 });
	const restoredDestination = new ItemPort({ id: "crusher:destination:input", size: 1 });
	restoredSource.restore(sourceSnapshot);
	restoredDestination.restore(destinationSnapshot);
	restored.registerExternalManagedDepot({
		dimensionId: "minecraft:overworld",
		id: sourceId,
		location: { x: 0, y: 64, z: 0 },
		onPortMutation() {
			sourceCheckpoints++;
		},
		port: restoredSource,
		role: "output"
	});
	restored.registerExternalManagedDepot({
		dimensionId: "minecraft:overworld",
		id: destinationId,
		location: { x: 3, y: 64, z: 0 },
		onPortMutation() {
			destinationCheckpoints++;
		},
		port: restoredDestination,
		role: "input"
	});
	advance(restored, () => restoredDestination.inspect().slots[0]?.count === 1 && !restored.diagnostics().waitingForCommit);
	assert.equal(destinationCheckpoints, 1);
	assert.deepEqual(restoredDestination.inspect().slots[0], { count: 1, typeId: "minecraft:iron_ore" });
});

test("DepotNetwork supplies Redstone Requester stock through its durable transfer journal", () => {
	const network = createNetwork(memoryStorage(), "createbedrock:redstone_request");
	const source = network.createDepot({ dimensionId: "minecraft:overworld", location: { x: 0, y: 64, z: 0 } });
	const destination = network.createDepot({ dimensionId: "minecraft:overworld", location: { x: 1, y: 64, z: 0 } });
	network.insert(source, { count: 12, typeId: "minecraft:copper_ingot" });
	assert.equal(network.stockCount(source, "minecraft:copper_ingot"), 12);
	assert.equal(network.requestItem({ destinationId: destination, id: "request-copper", itemType: "minecraft:copper_ingot", maxCount: 8 }).ok, true);
	advance(network, () => network.diagnostics().transfers === 0 && !network.diagnostics().waitingForCommit);
	assert.equal(network.stockCount(destination, "minecraft:copper_ingot"), 8);
	assert.equal(network.requestItem({ destinationId: destination, id: "request-too-many", itemType: "minecraft:copper_ingot", maxCount: 8 }).reason, "insufficient_total_stock");
});

test("DepotNetwork routes addressed requests and excludes reserved stock from network availability", () => {
	const network = createNetwork(memoryStorage(), "createbedrock:addressed_requests");
	const alpha = network.createDepot({
		dimensionId: "minecraft:overworld",
		location: { x: 0, y: 64, z: 0 },
		logistics: { address: "alpha", networkId: "factory" }
	});
	const beta = network.createDepot({
		dimensionId: "minecraft:overworld",
		location: { x: 2, y: 64, z: 0 },
		logistics: { address: "beta", networkId: "factory" }
	});
	const foreign = network.createDepot({
		dimensionId: "minecraft:overworld",
		location: { x: 4, y: 64, z: 0 },
		logistics: { address: "alpha", networkId: "warehouse" }
	});
	const destination = network.createDepot({ dimensionId: "minecraft:overworld", location: { x: 1, y: 64, z: 0 } });
	network.insert(alpha, { count: 8, typeId: "minecraft:copper_ingot" });
	network.insert(beta, { count: 5, typeId: "minecraft:copper_ingot" });
	network.insert(foreign, { count: 9, typeId: "minecraft:copper_ingot" });
	assert.deepEqual(network.networkStockSummary({ dimensionId: "minecraft:overworld", itemType: "minecraft:copper_ingot", networkId: "factory", targetAddress: "alpha" }), {
		available: 8, endpointCount: 1, inFlight: 0, physical: 8, reserved: 0
	});
	assert.deepEqual(network.networkStockSummary({ dimensionId: "minecraft:the_nether", itemType: "minecraft:copper_ingot", networkId: "factory", targetAddress: "alpha" }), {
		available: 0, endpointCount: 0, inFlight: 0, physical: 0, reserved: 0
	});
	const request = network.requestItem({
		destinationId: destination,
		id: "addressed-copper",
		itemType: "minecraft:copper_ingot",
		maxCount: 3,
		networkId: "factory",
		targetAddress: "alpha"
	});
	assert.equal(request.ok, true);
	assert.equal(request.transfers.length, 1);
	assert.equal(network.networkStockSummary({ dimensionId: "minecraft:overworld", itemType: "minecraft:copper_ingot", networkId: "factory", targetAddress: "alpha" }).available, 5);
	assert.equal(network.requestItem({
		destinationId: destination,
		id: "missing-address",
		itemType: "minecraft:copper_ingot",
		maxCount: 1,
		networkId: "factory",
		targetAddress: "gamma"
	}).reason, "address_unavailable");
	advance(network, () => network.diagnostics().transfers === 0 && !network.diagnostics().waitingForCommit);
	assert.equal(network.stockCount(destination, "minecraft:copper_ingot"), 3);
	assert.equal(network.stockCount(beta, "minecraft:copper_ingot"), 5);
	assert.equal(network.stockCount(foreign, "minecraft:copper_ingot"), 9);
});

test("DepotNetwork persists endpoint addresses and rejects stale endpoint edits", () => {
	const storage = memoryStorage();
	const first = createNetwork(storage, "createbedrock:endpoint_configuration");
	const id = first.createDepot({ dimensionId: "minecraft:overworld", location: { x: 0, y: 64, z: 0 } });
	assert.deepEqual(first.logisticsEndpoint(id), { acceptsRequests: true, address: "", networkId: "default", revision: 0 });
	const configured = first.configureLogisticsEndpoint(id, {
		expectedRevision: 0,
		patch: { acceptsRequests: false, address: "Smelter A", networkId: "Factory" }
	});
	assert.equal(configured.changed, true);
	assert.deepEqual(configured.endpoint, { acceptsRequests: false, address: "Smelter A", networkId: "factory", revision: 1 });
	assert.equal(first.configureLogisticsEndpoint(id, {
		expectedRevision: 0,
		patch: { address: "stale" }
	}).conflict, true);
	advance(first, () => !first.diagnostics().waitingForCommit);
	const restored = createNetwork(storage, "createbedrock:endpoint_configuration");
	restored.restore();
	assert.deepEqual(restored.logisticsEndpoint(id), { acceptsRequests: false, address: "Smelter A", networkId: "factory", revision: 1 });
});

test("DepotNetwork persists one multi-source Requester order until every transfer reaches a terminal state", () => {
	const storage = memoryStorage();
	const first = createNetwork(storage, "createbedrock:request_orders");
	const left = first.createDepot({ dimensionId: "minecraft:overworld", location: { x: 0, y: 64, z: 0 } });
	const right = first.createDepot({ dimensionId: "minecraft:overworld", location: { x: 2, y: 64, z: 0 } });
	const destination = first.createDepot({ dimensionId: "minecraft:overworld", location: { x: 1, y: 64, z: 0 }, size: 2 });
	first.insert(left, { count: 3, typeId: "minecraft:brass_ingot" });
	first.insert(right, { count: 5, typeId: "minecraft:brass_ingot" });
	const request = first.requestItem({ destinationId: destination, id: "request-order", itemType: "minecraft:brass_ingot", maxCount: 8 });
	assert.equal(request.ok, true);
	assert.equal(request.order.state, "pending");
	assert.equal(request.order.transferIds.length, 2);
	advance(first, () => !first.diagnostics().waitingForCommit);

	const restored = createNetwork(storage, "createbedrock:request_orders");
	restored.restore();
	assert.equal(restored.requestStatus("request-order")?.state, "pending");
	advance(restored, () => restored.requestStatus("request-order")?.state === "fulfilled" && restored.diagnostics().transfers === 0 && !restored.diagnostics().waitingForCommit);
	const completed = restored.requestStatus("request-order");
	assert.equal(completed?.state, "fulfilled");
	assert.deepEqual(completed?.completedTransferIds, completed?.transferIds);
	assert.equal(restored.stockCount(destination, "minecraft:brass_ingot"), 8);
	assert.equal(restored.requestItem({ destinationId: destination, id: "request-order", itemType: "minecraft:brass_ingot", maxCount: 8 }).duplicate, true);
});

test("DepotNetwork keeps a Requester order pending while its destination is full, then completes it once", () => {
	const network = createNetwork(memoryStorage(), "createbedrock:request_order_destination_full");
	const source = network.createDepot({ dimensionId: "minecraft:overworld", location: { x: 0, y: 64, z: 0 } });
	const destination = network.createDepot({ dimensionId: "minecraft:overworld", location: { x: 1, y: 64, z: 0 }, maxStackSize: 1 });
	network.insert(source, { count: 1, typeId: "minecraft:brass_ingot" });
	network.insert(destination, { count: 1, typeId: "minecraft:dirt" });
	assert.equal(network.requestItem({ destinationId: destination, id: "blocked-order", itemType: "minecraft:brass_ingot", maxCount: 1 }).ok, true);
	advance(network, () => network.snapshot().some(record => record.kind === "transfer" && record.state === "escrowed") && !network.diagnostics().waitingForCommit);
	assert.equal(network.requestStatus("blocked-order")?.state, "pending");
	assert.deepEqual(network.extract(destination), { count: 1, typeId: "minecraft:dirt" });
	advance(network, () => network.requestStatus("blocked-order")?.state === "fulfilled" && network.diagnostics().transfers === 0 && !network.diagnostics().waitingForCommit);
	assert.deepEqual(network.extract(destination), { count: 1, typeId: "minecraft:brass_ingot" });
});

test("DepotNetwork persists a failed Requester order after a reserved source changes", () => {
	const storage = memoryStorage();
	const first = createNetwork(storage, "createbedrock:request_order_source_changed");
	const source = first.createDepot({ dimensionId: "minecraft:overworld", location: { x: 0, y: 64, z: 0 } });
	const destination = first.createDepot({ dimensionId: "minecraft:overworld", location: { x: 1, y: 64, z: 0 } });
	first.insert(source, { count: 2, typeId: "minecraft:brass_ingot" });
	assert.equal(first.requestItem({ destinationId: destination, id: "changed-order", itemType: "minecraft:brass_ingot", maxCount: 2 }).ok, true);
	assert.deepEqual(first.extract(source), { count: 2, typeId: "minecraft:brass_ingot" });
	advance(first, () => first.requestStatus("changed-order")?.state === "failed" && first.diagnostics().transfers === 0 && !first.diagnostics().waitingForCommit);
	assert.equal(first.requestItem({ destinationId: destination, id: "changed-order", itemType: "minecraft:brass_ingot", maxCount: 2 }).reason, "request_failed");

	const restored = createNetwork(storage, "createbedrock:request_order_source_changed");
	restored.restore();
	assert.equal(restored.requestStatus("changed-order")?.state, "failed");
	assert.equal(restored.stockCount(destination, "minecraft:brass_ingot"), 0);
});

test("DepotNetwork fulfils one Redstone Requester order from multiple persisted source intents", () => {
	const network = createNetwork(memoryStorage(), "createbedrock:redstone_request_multiple_sources");
	const first = network.createDepot({ dimensionId: "minecraft:overworld", location: { x: 0, y: 64, z: 0 } });
	const second = network.createDepot({ dimensionId: "minecraft:overworld", location: { x: 2, y: 64, z: 0 } });
	const destination = network.createDepot({ dimensionId: "minecraft:overworld", location: { x: 1, y: 64, z: 0 }, size: 2 });
	network.insert(first, { count: 3, typeId: "minecraft:brass_ingot" });
	network.insert(second, { count: 5, typeId: "minecraft:brass_ingot" });
	const request = network.requestItem({ destinationId: destination, id: "request-brass", itemType: "minecraft:brass_ingot", maxCount: 8 });
	assert.equal(request.ok, true);
	assert.equal(request.reserved, 8);
	assert.equal(request.transfers.length, 2);
	advance(network, () => network.diagnostics().transfers === 0 && !network.diagnostics().waitingForCommit);
	assert.equal(network.stockCount(first, "minecraft:brass_ingot"), 0);
	assert.equal(network.stockCount(second, "minecraft:brass_ingot"), 0);
	assert.equal(network.stockCount(destination, "minecraft:brass_ingot"), 8);

	network.insert(first, { count: 2, typeId: "minecraft:brass_ingot" });
	const partial = network.requestItem({
		allowPartial: true,
		destinationId: destination,
		id: "request-brass-partial",
		itemType: "minecraft:brass_ingot",
		maxCount: 5
	});
	assert.equal(partial.ok, true);
	assert.equal(partial.reserved, 2);
});

test("DepotNetwork restores a durable intent before changing its source depot", () => {
	const storage = memoryStorage();
	const first = createNetwork(storage, "createbedrock:depot_intent_restart");
	const source = first.createDepot({ dimensionId: "minecraft:overworld", location: { x: 0, y: 64, z: 0 } });
	const destination = first.createDepot({ dimensionId: "minecraft:overworld", location: { x: 1, y: 64, z: 0 } });
	first.insert(source, { count: 3, typeId: "minecraft:gold_ingot" });
	assert.equal(first.beginTransfer({ destinationId: destination, id: "intent-restart", maxCount: 2, sourceId: source }).ok, true);
	advance(first, () => !first.diagnostics().waitingForCommit);
	assert.equal(first.snapshot().find(record => record.kind === "transfer")?.state, "intent");
	assert.deepEqual(depotSlots(first, source), [{ count: 3, typeId: "minecraft:gold_ingot" }]);

	const restored = createNetwork(storage, "createbedrock:depot_intent_restart");
	assert.deepEqual(restored.restore(), { belts: 0, chutes: 0, depots: 2, funnels: 0, transfers: 1, transports: 0, warnings: [] });
	assert.deepEqual(depotSlots(restored, source), [{ count: 3, typeId: "minecraft:gold_ingot" }]);
	advance(restored, () => restored.diagnostics().transfers === 0 && !restored.diagnostics().waitingForCommit);
	assert.deepEqual(restored.extract(source), { count: 1, typeId: "minecraft:gold_ingot" });
	assert.deepEqual(restored.extract(destination), { count: 2, typeId: "minecraft:gold_ingot" });
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

test("DepotNetwork re-keys a detached inventory port when an assembly materializes", () => {
	const network = createNetwork(memoryStorage(), "createbedrock:depot_assembly_move");
	const sourceLocation = { x: 0, y: 64, z: 0 };
	const targetLocation = { x: 8, y: 70, z: -3 };
	const source = network.createDepot({ dimensionId: "minecraft:overworld", location: sourceLocation, size: 2 });
	network.configureLogisticsEndpoint(source, {
		expectedRevision: 0,
		patch: { acceptsRequests: false, address: "assembly-line", networkId: "factory" }
	});
	network.insert(source, { count: 12, typeId: "minecraft:iron_ingot" });
	const captured = network.snapshotDepotForAssembly(source);
	assert.equal(captured.port.id, source);
	assert.equal(network.takeDepotForAssembly(source).port.id, source);
	assert.equal(network.hasDepot(source), false);

	const target = network.restoreDepotFromAssembly({
		dimensionId: "minecraft:overworld",
		location: targetLocation,
		record: captured
	});
	assert.equal(target, depotId("minecraft:overworld", targetLocation));
	assert.deepEqual(depotSlots(network, target), [{ count: 12, typeId: "minecraft:iron_ingot" }, undefined]);
	assert.deepEqual(network.logisticsEndpoint(target), {
		acceptsRequests: false,
		address: "assembly-line",
		networkId: "factory",
		revision: 1
	});
	assert.equal(network.snapshot().find(record => record.kind === "depot" && record.port.id === target)?.port.id, target);
});

test("DepotNetwork re-keys historical managed-port receipts with the moved depot", () => {
	const network = createNetwork(memoryStorage(), "createbedrock:depot_assembly_receipts");
	const source = network.createDepot({ dimensionId: "minecraft:overworld", location: { x: 0, y: 64, z: 0 } });
	const destination = network.createDepot({ dimensionId: "minecraft:overworld", location: { x: 1, y: 64, z: 0 } });
	network.insert(source, { count: 1, typeId: "minecraft:copper_ingot" });
	network.beginTransfer({ destinationId: destination, id: "receipt-history", maxCount: 1, sourceId: source });
	advance(network, () => network.diagnostics().transfers === 0 && !network.diagnostics().waitingForCommit);
	const record = network.takeDepotForAssembly(source);
	const target = network.restoreDepotFromAssembly({
		dimensionId: "minecraft:overworld",
		location: { x: 9, y: 64, z: 0 },
		record
	});
	const restored = network.snapshot().find(candidate => candidate.kind === "depot" && candidate.port.id === target)?.port;
	assert.ok(restored.extractionReceipts.length > 0);
	assert.ok(restored.extractionReceipts.every(([, receipt]) => receipt.reservationFingerprint.includes(target)));
	assert.ok(restored.extractionReceipts.every(([, receipt]) => !receipt.reservationFingerprint.includes(source)));
});

test("DepotNetwork refuses to detach ports that still own fixed logistics work", () => {
	const network = createNetwork(memoryStorage(), "createbedrock:depot_assembly_busy");
	const source = network.createDepot({ dimensionId: "minecraft:overworld", location: { x: 0, y: 64, z: 0 } });
	const destination = network.createDepot({ dimensionId: "minecraft:overworld", location: { x: 1, y: 64, z: 0 } });
	network.insert(source, { count: 1, typeId: "minecraft:iron_ingot" });
	assert.equal(network.beginTransfer({ destinationId: destination, id: "assembly-busy", maxCount: 1, sourceId: source }).ok, true);
	assert.throws(() => network.snapshotDepotForAssembly(source), /active transfer or logistics connection/);
	assert.equal(network.hasDepot(source), true);
});

test("DepotNetwork carries a Creative Crate template through an assembly move", () => {
	const network = createNetwork(memoryStorage(), "createbedrock:creative_assembly_move");
	const source = network.createDepot({ dimensionId: "minecraft:overworld", kind: "creative", location: { x: 0, y: 64, z: 0 } });
	network.setCreativeTemplate(source, { count: 1, typeId: "minecraft:brass_ingot" });
	const record = network.takeDepotForAssembly(source);
	const target = network.restoreDepotFromAssembly({
		dimensionId: "minecraft:overworld",
		location: { x: 4, y: 64, z: 0 },
		record
	});
	const restored = network.snapshot().find(candidate => candidate.kind === "depot" && candidate.port.id === target);
	assert.equal(restored.portKind, "creative");
	assert.deepEqual(restored.port.template, { count: 1, typeId: "minecraft:brass_ingot" });
});

test("DepotNetwork commits a player deposit only after its physical escrow checkpoint", () => {
	const storage = memoryStorage();
	const source = new FakeContainer(1, [{ count: 3, typeId: "minecraft:iron_ingot" }]);
	const escrows = new Map([["escrow:deposit", { container: new FakeContainer(1) }]]);
	const callbacks = externalDepositCallbacks({ escrows, source });
	const first = createNetwork(storage, "createbedrock:depot_external_deposit");
	const destination = first.createDepot({ dimensionId: "minecraft:overworld", location: { x: 0, y: 64, z: 0 } });
	assert.equal(first.beginExternalDeposit({
		depotId: destination,
		escrowId: "escrow:deposit",
		id: "deposit",
		item: { count: 3, typeId: "minecraft:iron_ingot" },
		source: { id: "player", slot: 0 }
	}).ok, true);
	advance(first, () => !first.diagnostics().waitingForCommit);
	assert.deepEqual(source.getItem(0), { count: 3, typeId: "minecraft:iron_ingot" });
	advanceExternalDeposit(first, callbacks, () => first.snapshot().some(record => record.kind === "external_deposit" && record.state === "escrowed") && !first.diagnostics().waitingForCommit);
	assert.equal(source.getItem(0), undefined);
	assert.deepEqual(escrows.get("escrow:deposit")?.container.getItem(0), { count: 3, typeId: "minecraft:iron_ingot" });

	const restored = createNetwork(storage, "createbedrock:depot_external_deposit");
	assert.equal(restored.restore().depots, 1);
	advanceExternalDeposit(restored, callbacks, () => restored.diagnostics().externalDeposits === 0 && !restored.diagnostics().waitingForCommit);
	assert.deepEqual(depotSlots(restored, destination), [{ count: 3, typeId: "minecraft:iron_ingot" }]);
	assert.equal(escrows.get("escrow:deposit")?.container.getItem(0), undefined);
});

test("DepotNetwork rejects a full depot before moving a player stack", () => {
	const source = new FakeContainer(1, [{ count: 1, typeId: "minecraft:gold_ingot" }]);
	const escrows = new Map([["escrow:full", { container: new FakeContainer(1) }]]);
	const callbacks = externalDepositCallbacks({ escrows, source });
	const network = createNetwork(memoryStorage(), "createbedrock:depot_external_full");
	const destination = network.createDepot({ dimensionId: "minecraft:overworld", location: { x: 0, y: 64, z: 0 }, maxStackSize: 1 });
	network.insert(destination, { count: 1, typeId: "minecraft:dirt" });
	assert.equal(network.beginExternalDeposit({
		depotId: destination,
		escrowId: "escrow:full",
		id: "full",
		item: { count: 1, typeId: "minecraft:gold_ingot" },
		source: { id: "player", slot: 0 }
	}).ok, false);
	assert.equal(source.getItem(0)?.typeId, "minecraft:gold_ingot");
	assert.equal(escrows.get("escrow:full")?.container.getItem(0), undefined);
});

test("DepotNetwork restores a player withdrawal after the native target move", () => {
	const storage = memoryStorage();
	const target = new FakeContainer(1);
	const escrows = new Map([["escrow:withdraw", { container: new FakeContainer(1) }]]);
	const callbacks = externalWithdrawalCallbacks({ escrows, target });
	const first = createNetwork(storage, "createbedrock:depot_external_withdrawal");
	const source = first.createDepot({ dimensionId: "minecraft:overworld", location: { x: 0, y: 64, z: 0 } });
	first.insert(source, { count: 3, typeId: "minecraft:iron_ingot" });
	assert.equal(first.beginExternalWithdrawal({
		depotId: source,
		escrowId: "escrow:withdraw",
		id: "withdraw",
		maxCount: 3,
		target: { id: "player", slot: 0 }
	}).ok, true);
	assert.equal(first.beginExternalWithdrawal({
		depotId: source,
		escrowId: "escrow:second",
		id: "second",
		maxCount: 1,
		target: { id: "player", slot: 0 }
	}).reason, "depot_busy");
	advance(first, () => !first.diagnostics().waitingForCommit);
	assert.deepEqual(depotSlots(first, source), [{ count: 3, typeId: "minecraft:iron_ingot" }]);
	advanceExternalWithdrawal(first, callbacks, () => first.snapshot().some(record => record.kind === "external_withdrawal" && record.state === "escrowed") && !first.diagnostics().waitingForCommit);
	assert.deepEqual(depotSlots(first, source), [undefined]);
	assert.equal(first.canRemoveDepot(source), false);
	// Move to the player but deliberately do not persist the delivered checkpoint.
	// Recovery must recognize the target as the unique physical owner.
	assert.equal(first.tickExternalWithdrawals(callbacks), true);
	assert.deepEqual(target.getItem(0), { count: 3, typeId: "minecraft:iron_ingot" });
	assert.equal(escrows.get("escrow:withdraw")?.container.getItem(0), undefined);

	const restored = createNetwork(storage, "createbedrock:depot_external_withdrawal");
	assert.equal(restored.restore().depots, 1);
	advanceExternalWithdrawal(restored, callbacks, () => restored.diagnostics().externalWithdrawals === 0 && !restored.diagnostics().waitingForCommit);
	assert.deepEqual(depotSlots(restored, source), [undefined]);
	assert.deepEqual(target.getItem(0), { count: 3, typeId: "minecraft:iron_ingot" });
});

test("DepotNetwork holds a withdrawal in escrow until the player target slot is empty", () => {
	const target = new FakeContainer(1, [{ count: 1, typeId: "minecraft:dirt" }]);
	const escrows = new Map([["escrow:withdraw-full", { container: new FakeContainer(1) }]]);
	const callbacks = externalWithdrawalCallbacks({ escrows, target });
	const network = createNetwork(memoryStorage(), "createbedrock:depot_external_withdrawal_full");
	const source = network.createDepot({ dimensionId: "minecraft:overworld", location: { x: 0, y: 64, z: 0 } });
	network.insert(source, { count: 1, typeId: "minecraft:gold_ingot" });
	assert.equal(network.beginExternalWithdrawal({
		depotId: source,
		escrowId: "escrow:withdraw-full",
		id: "withdraw-full",
		maxCount: 1,
		target: { id: "player", slot: 0 }
	}).ok, true);
	advanceExternalWithdrawal(network, callbacks, () => network.snapshot().some(record => record.kind === "external_withdrawal" && record.state === "escrowed") && escrows.get("escrow:withdraw-full")?.container.getItem(0)?.typeId === "minecraft:gold_ingot" && !network.diagnostics().waitingForCommit);
	assert.deepEqual(escrows.get("escrow:withdraw-full")?.container.getItem(0), { count: 1, typeId: "minecraft:gold_ingot" });
	assert.deepEqual(target.getItem(0), { count: 1, typeId: "minecraft:dirt" });
	target.setItem(0, undefined);
	advanceExternalWithdrawal(network, callbacks, () => network.diagnostics().externalWithdrawals === 0 && !network.diagnostics().waitingForCommit);
	assert.deepEqual(target.getItem(0), { count: 1, typeId: "minecraft:gold_ingot" });
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

test("DepotNetwork exposes durable belt endpoints for the world connector", () => {
	const network = createNetwork(memoryStorage(), "createbedrock:world_belt_endpoints");
	const source = network.createDepot({ dimensionId: "minecraft:overworld", location: { x: 0, y: 64, z: 0 } });
	const destination = network.createDepot({ dimensionId: "minecraft:overworld", location: { x: 8, y: 64, z: 0 } });
	network.createBelt({ destinationId: destination, id: "world-belt", length: 8, sourceId: source });
	assert.equal(network.hasBelt("world-belt"), true);
	assert.deepEqual(network.worldBelts(), [{
		destination: { dimensionId: "minecraft:overworld", location: { x: 8, y: 64, z: 0 } },
		id: "world-belt",
		source: { dimensionId: "minecraft:overworld", location: { x: 0, y: 64, z: 0 } }
	}]);
	assert.equal(network.removeBelt("world-belt"), true);
	assert.equal(network.hasBelt("world-belt"), false);
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

test("DepotNetwork persists a creative crate template and does not consume it during transfers", () => {
	const storage = memoryStorage();
	const first = createNetwork(storage, "createbedrock:creative_crate");
	const source = first.createDepot({ dimensionId: "minecraft:overworld", kind: "creative", location: { x: 0, y: 64, z: 0 } });
	const destination = first.createDepot({ dimensionId: "minecraft:overworld", location: { x: 1, y: 64, z: 0 } });
	assert.equal(first.setCreativeTemplate(source, { count: 4, typeId: "minecraft:brass_ingot" }), true);
	first.createFunnel({ destinationId: destination, id: "creative-funnel", sourceId: source });
	advance(first, () => depotSlots(first, destination)?.[0]?.count === 4 && !first.diagnostics().waitingForCommit);
	assert.deepEqual(first.extract(source), { count: 4, typeId: "minecraft:brass_ingot" });
	assert.deepEqual(first.extract(source), { count: 4, typeId: "minecraft:brass_ingot" });

	const restored = createNetwork(storage, "createbedrock:creative_crate");
	assert.equal(restored.restore().depots, 2);
	assert.deepEqual(restored.extract(source), { count: 4, typeId: "minecraft:brass_ingot" });
});

test("DepotNetwork applies durable smart-chute filters before reserving a source item", () => {
	const network = createNetwork(memoryStorage(), "createbedrock:smart_chute_filter");
	const source = network.createDepot({ dimensionId: "minecraft:overworld", location: { x: 0, y: 65, z: 0 }, size: 2 });
	const destination = network.createDepot({ dimensionId: "minecraft:overworld", location: { x: 0, y: 63, z: 0 } });
	network.insert(source, { count: 1, typeId: "minecraft:dirt" });
	network.insert(source, { count: 2, typeId: "minecraft:iron_ingot" });
	network.createChute({ destinationId: destination, filter: { typeIds: ["minecraft:iron_ingot"] }, id: "smart-chute", sourceId: source });
	advance(network, () => depotSlots(network, destination)?.[0]?.typeId === "minecraft:iron_ingot" && !network.diagnostics().waitingForCommit);
	assert.deepEqual(network.extract(destination), { count: 2, typeId: "minecraft:iron_ingot" });
	assert.deepEqual(network.extract(source), { count: 1, typeId: "minecraft:dirt" });
});
