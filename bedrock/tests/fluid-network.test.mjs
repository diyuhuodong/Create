import assert from "node:assert/strict";
import test from "node:test";

import { FluidNetwork } from "../behavior_pack/scripts/fluids/fluid-network.js";
import { FluidPort } from "../behavior_pack/scripts/fluids/fluid-port.js";
import { FluidTank } from "../behavior_pack/scripts/fluids/fluid-tank.js";

function tankPort({ capacity = 1000, contents, id }) {
	const tank = new FluidTank({ capacity, contents, id });
	return { port: new FluidPort({ tank }), tank };
}

function createNetwork(...ports) {
	const network = new FluidNetwork({ transfersPerTick: 4 });
	for (const port of ports)
		network.registerPort(port);
	return network;
}

test("FluidNetwork moves bounded virtual-fluid amounts only after a pipe valve opens", () => {
	const source = tankPort({ contents: { amount: 700, typeId: "minecraft:water" }, id: "tank:source" });
	const destination = tankPort({ id: "tank:destination" });
	const network = createNetwork(source.port, destination.port);
	network.createPipe({ destinationId: destination.port.id, id: "pipe:0", maxAmountPerTick: 250, open: false, sourceId: source.port.id });
	assert.equal(network.tick().processed, 0);
	assert.equal(destination.tank.inspect().contents, undefined);
	network.setPipeOpen("pipe:0", true);
	assert.deepEqual(network.tick().outcomes, [{ id: "pipe:0", ok: true, state: "intent" }]);
	assert.deepEqual(source.tank.inspect().contents, { amount: 700, typeId: "minecraft:water" });
	assert.equal(destination.tank.inspect().contents, undefined);
	assert.deepEqual(network.tick().outcomes, [{ id: "pipe:0", ok: true, state: "escrowed" }]);
	assert.deepEqual(source.tank.inspect().contents, { amount: 450, typeId: "minecraft:water" });
	assert.equal(destination.tank.inspect().contents, undefined);
	assert.deepEqual(network.tick().outcomes, [{ id: "pipe:0", ok: true, state: "committed" }]);
	assert.deepEqual(destination.tank.inspect().contents, { amount: 250, typeId: "minecraft:water" });
	assert.deepEqual(network.tick().outcomes, [{ id: "pipe:0", ok: true, state: "intent" }]);
	assert.deepEqual(network.tick().outcomes, [{ id: "pipe:0", ok: true, state: "escrowed" }]);
	assert.deepEqual(network.tick().outcomes, [{ id: "pipe:0", ok: true, state: "committed" }]);
	assert.deepEqual(source.tank.inspect().contents, { amount: 200, typeId: "minecraft:water" });
	assert.deepEqual(destination.tank.inspect().contents, { amount: 500, typeId: "minecraft:water" });
});

test("FluidNetwork retains a pump escrow while full and resumes it exactly once after restart", () => {
	const source = tankPort({ contents: { amount: 500, typeId: "minecraft:water" }, id: "tank:source" });
	const destination = tankPort({ capacity: 200, contents: { amount: 200, typeId: "minecraft:water" }, id: "tank:destination" });
	const first = createNetwork(source.port, destination.port);
	first.createPump({ destinationId: destination.port.id, id: "pump:0", maxAmountPerTick: 300, sourceId: source.port.id });
	assert.deepEqual(first.tick().outcomes, [{ id: "pump:0", ok: true, state: "intent" }]);
	assert.deepEqual(first.tick().outcomes, [{ id: "pump:0", ok: true, state: "escrowed" }]);
	assert.deepEqual(first.tick().outcomes, [{ id: "pump:0", ok: false, reason: "destination_full", state: "escrowed" }]);
	assert.deepEqual(source.tank.inspect().contents, { amount: 200, typeId: "minecraft:water" });

	const restoredSource = tankPort({ id: "tank:source" });
	restoredSource.tank.restore(source.tank.snapshot());
	const restoredDestination = tankPort({ capacity: 200, id: "tank:destination" });
	restoredDestination.tank.restore(destination.tank.snapshot());
	const restored = createNetwork(restoredSource.port, restoredDestination.port);
	restored.restore(first.snapshot());
	restoredDestination.tank.extract(restoredDestination.tank.reserve());
	restored.markPortDirty(restoredDestination.port.id);
	assert.deepEqual(restored.tick().outcomes, [{ id: "pump:0", ok: false, reason: "destination_full", state: "escrowed" }]);
	assert.deepEqual(restoredDestination.tank.inspect().contents, { amount: 200, typeId: "minecraft:water" });
	restoredDestination.tank.extract(restoredDestination.tank.reserve());
	restored.markPortDirty(restoredDestination.port.id);
	assert.deepEqual(restored.tick().outcomes, [{ id: "pump:0", ok: true, state: "committed" }]);
	assert.deepEqual(restoredSource.tank.inspect().contents, { amount: 200, typeId: "minecraft:water" });
	assert.deepEqual(restoredDestination.tank.inspect().contents, { amount: 100, typeId: "minecraft:water" });
});

test("FluidNetwork pump state and transfer budget are deterministic", () => {
	const source = tankPort({ contents: { amount: 200, typeId: "minecraft:water" }, id: "tank:source" });
	const firstDestination = tankPort({ id: "tank:first" });
	const secondDestination = tankPort({ id: "tank:second" });
	const network = createNetwork(source.port, firstDestination.port, secondDestination.port);
	network.createPump({ destinationId: firstDestination.port.id, id: "pump:stopped", maxAmountPerTick: 100, running: false, sourceId: source.port.id });
	network.createPipe({ destinationId: secondDestination.port.id, id: "pipe:second", maxAmountPerTick: 100, sourceId: source.port.id });
	assert.deepEqual(network.tick({ budget: 1 }).outcomes, [{ id: "pipe:second", ok: true, state: "intent" }]);
	assert.deepEqual(source.tank.inspect().contents, { amount: 200, typeId: "minecraft:water" });
	network.setPumpRunning("pump:stopped", true);
	assert.deepEqual(network.tick({ budget: 1 }).outcomes, [{ id: "pump:stopped", ok: false, reason: "source_busy" }]);
	assert.deepEqual(network.tick({ budget: 1 }).outcomes, [{ id: "pipe:second", ok: true, state: "escrowed" }]);
	assert.deepEqual(source.tank.inspect().contents, { amount: 100, typeId: "minecraft:water" });
	assert.equal(firstDestination.tank.inspect().contents, undefined);
	assert.equal(secondDestination.tank.inspect().contents, undefined);
	assert.deepEqual(network.tick({ budget: 1 }).outcomes, [{ id: "pipe:second", ok: true, state: "committed" }]);
	assert.deepEqual(secondDestination.tank.inspect().contents, { amount: 100, typeId: "minecraft:water" });
	assert.deepEqual(network.tick({ budget: 1 }).outcomes, [{ id: "pump:stopped", ok: true, state: "intent" }]);
	assert.deepEqual(network.tick({ budget: 1 }).outcomes, [{ id: "pipe:second", ok: false, reason: "source_busy" }]);
	assert.deepEqual(network.tick({ budget: 1 }).outcomes, [{ id: "pump:stopped", ok: true, state: "escrowed" }]);
	assert.deepEqual(network.tick({ budget: 1 }).outcomes, [{ id: "pump:stopped", ok: true, state: "committed" }]);
	assert.deepEqual(firstDestination.tank.inspect().contents, { amount: 100, typeId: "minecraft:water" });
});

test("FluidNetwork rejects snapshots with orphaned escrow records", () => {
	const source = tankPort({ id: "tank:source" });
	const destination = tankPort({ id: "tank:destination" });
	const network = createNetwork(source.port, destination.port);
	assert.throws(() => network.restore({
		links: [],
		transfers: [{
			destinationId: "tank:destination",
			fluid: { amount: 1, typeId: "minecraft:water" },
			deliveryAttempt: 0,
			id: "orphan",
			partition: "fluid-transaction:0",
			sourceId: "tank:source",
			state: "escrowed"
		}]
	}), /unowned transfer/);
});

test("FluidNetwork settles existing escrow after a pump stops without launching another transfer", () => {
	const source = tankPort({ contents: { amount: 500, typeId: "minecraft:water" }, id: "tank:source" });
	const destination = tankPort({ capacity: 200, contents: { amount: 200, typeId: "minecraft:water" }, id: "tank:destination" });
	const network = createNetwork(source.port, destination.port);
	network.createPump({ destinationId: destination.port.id, id: "pump:escrow", maxAmountPerTick: 300, sourceId: source.port.id });
	assert.equal(network.tick().outcomes[0].state, "intent");
	assert.equal(network.tick().outcomes[0].state, "escrowed");
	assert.equal(network.tick().outcomes[0].reason, "destination_full");
	network.setPumpRunning("pump:escrow", false);
	destination.tank.extract(destination.tank.reserve());
	network.markPortDirty(destination.port.id);
	assert.equal(network.tick().outcomes[0].reason, "destination_full");
	destination.tank.extract(destination.tank.reserve());
	network.markPortDirty(destination.port.id);
	assert.deepEqual(network.tick().outcomes, [{ id: "pump:escrow", ok: true, state: "committed" }]);
	assert.deepEqual(source.tank.inspect().contents, { amount: 200, typeId: "minecraft:water" });
	assert.deepEqual(destination.tank.inspect().contents, { amount: 100, typeId: "minecraft:water" });
	assert.equal(network.diagnostics().activeTransfers, 0);
	assert.equal(network.tick().processed, 0);
});

test("FluidNetwork retries an unavailable durable destination without discarding its escrow", () => {
	const source = tankPort({ contents: { amount: 100, typeId: "minecraft:water" }, id: "tank:source" });
	const target = tankPort({ id: "world:target" });
	let available = false;
	const destination = {
		extract(reservation, options) {
			return target.port.extract(reservation, options);
		},
		id: target.port.id,
		insert(fluid, options) {
			if (!available) {
				const error = new Error("target chunk is unavailable");
				error.transactionState = "retry";
				throw error;
			}
			return target.port.insert(fluid, options);
		},
		reserve(options) {
			return target.port.reserve(options);
		}
	};
	const network = createNetwork(source.port, destination);
	network.createPump({ destinationId: destination.id, id: "pump:retry", maxAmountPerTick: 100, sourceId: source.port.id });
	assert.equal(network.tick().outcomes[0].state, "intent");
	assert.equal(network.tick().outcomes[0].state, "escrowed");
	assert.deepEqual(network.tick().outcomes, [{ error: "Error: target chunk is unavailable", id: "pump:retry", ok: false, reason: "destination_retry", state: "escrowed" }]);
	assert.deepEqual(source.tank.inspect().contents, undefined);
	assert.equal(network.diagnostics().activeTransfers, 1);
	available = true;
	assert.deepEqual(network.tick().outcomes, [{ id: "pump:retry", ok: true, state: "committed" }]);
	assert.deepEqual(target.tank.inspect().contents, { amount: 100, typeId: "minecraft:water" });
});
