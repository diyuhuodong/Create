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
	assert.deepEqual(network.tick().outcomes, [{ id: "pipe:0", ok: true, state: "committed" }]);
	assert.deepEqual(source.tank.inspect().contents, { amount: 450, typeId: "minecraft:water" });
	assert.deepEqual(destination.tank.inspect().contents, { amount: 250, typeId: "minecraft:water" });
	assert.deepEqual(network.tick().outcomes, [{ id: "pipe:0", ok: true, state: "committed" }]);
	assert.deepEqual(source.tank.inspect().contents, { amount: 200, typeId: "minecraft:water" });
	assert.deepEqual(destination.tank.inspect().contents, { amount: 500, typeId: "minecraft:water" });
});

test("FluidNetwork retains a pump escrow while full and resumes it exactly once after restart", () => {
	const source = tankPort({ contents: { amount: 500, typeId: "minecraft:water" }, id: "tank:source" });
	const destination = tankPort({ capacity: 200, contents: { amount: 200, typeId: "minecraft:water" }, id: "tank:destination" });
	const first = createNetwork(source.port, destination.port);
	first.createPump({ destinationId: destination.port.id, id: "pump:0", maxAmountPerTick: 300, sourceId: source.port.id });
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
	assert.deepEqual(network.tick({ budget: 1 }).outcomes, [{ id: "pipe:second", ok: true, state: "committed" }]);
	assert.equal(firstDestination.tank.inspect().contents, undefined);
	assert.deepEqual(secondDestination.tank.inspect().contents, { amount: 100, typeId: "minecraft:water" });
	network.setPumpRunning("pump:stopped", true);
	assert.deepEqual(network.tick({ budget: 1 }).outcomes, [{ id: "pump:stopped", ok: true, state: "committed" }]);
	assert.deepEqual(firstDestination.tank.inspect().contents, { amount: 100, typeId: "minecraft:water" });
	assert.deepEqual(network.tick({ budget: 1 }).outcomes, [{ id: "pipe:second", ok: false, reason: "source_empty" }]);
	assert.deepEqual(secondDestination.tank.inspect().contents, { amount: 100, typeId: "minecraft:water" });
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
