import assert from "node:assert/strict";
import test from "node:test";

import { CreativeFluidPort } from "../behavior_pack/scripts/fluids/creative-fluid-port.js";
import { FluidNetwork } from "../behavior_pack/scripts/fluids/fluid-network.js";
import { FluidPort } from "../behavior_pack/scripts/fluids/fluid-port.js";
import { FluidTank } from "../behavior_pack/scripts/fluids/fluid-tank.js";

function destination(id = "tank:destination") {
	const tank = new FluidTank({ capacity: 1_000, id });
	return { port: new FluidPort({ tank }), tank };
}

function advance(network, predicate, maximumTicks = 20) {
	for (let tick = 0; tick < maximumTicks; tick++) {
		network.tick();
		if (predicate())
			return;
	}
	throw new Error("Creative fluid network did not reach the expected state");
}

test("CreativeFluidPort repeatedly supplies its selected fluid without depleting", () => {
	const source = new CreativeFluidPort({ id: "creative:source" });
	const target = destination();
	const network = new FluidNetwork({ transfersPerTick: 1 });
	network.registerPort(source);
	network.registerPort(target.port);
	network.createPipe({ destinationId: target.port.id, id: "pipe:creative", maxAmountPerTick: 250, sourceId: source.id });
	advance(network, () => target.tank.inspect().contents?.amount === 250);
	assert.deepEqual(source.inspect().contents, { amount: Number.MAX_SAFE_INTEGER, typeId: "minecraft:water" });
	target.tank.extract(target.tank.reserve());
	network.markPortDirty(target.port.id);
	advance(network, () => target.tank.inspect().contents?.amount === 250);
	assert.deepEqual(source.inspect().contents, { amount: Number.MAX_SAFE_INTEGER, typeId: "minecraft:water" });
});

test("CreativeFluidPort rejects an obsolete reservation after the selected fluid changes", () => {
	const source = new CreativeFluidPort({ id: "creative:source", fluidType: "minecraft:water" });
	const reservation = source.reserve({ maxAmount: 250 });
	source.setFluidType("minecraft:lava");
	assert.throws(() => source.extract(reservation, { receiptId: "selection-change" }), /no longer matches/);
	assert.equal(source.reserve({ maxAmount: 250, predicate: fluid => fluid.typeId === "minecraft:water" }), undefined);
	assert.deepEqual(source.extract(source.reserve({ maxAmount: 250 })), { amount: 250, typeId: "minecraft:lava" });
});

test("CreativeFluidPort restores a filtered pipe intent without duplicating or consuming fluid", () => {
	const firstSource = new CreativeFluidPort({ id: "creative:source" });
	const firstTarget = destination();
	const first = new FluidNetwork({ transfersPerTick: 1 });
	first.registerPort(firstSource);
	first.registerPort(firstTarget.port);
	first.createPipe({ destinationId: firstTarget.port.id, filter: "minecraft:water", id: "pipe:creative-restart", maxAmountPerTick: 250, sourceId: firstSource.id });
	assert.equal(first.tick().outcomes[0].state, "intent");

	const restoredSource = new CreativeFluidPort({ id: "creative:source" });
	const restoredTarget = destination();
	const restored = new FluidNetwork({ transfersPerTick: 1 });
	restored.registerPort(restoredSource);
	restored.registerPort(restoredTarget.port);
	restored.restore(first.snapshot());
	assert.equal(restored.tick().outcomes[0].state, "escrowed");
	assert.equal(restored.tick().outcomes[0].state, "committed");
	assert.deepEqual(restoredTarget.tank.inspect().contents, { amount: 250, typeId: "minecraft:water" });
	assert.deepEqual(restoredSource.inspect().contents, { amount: Number.MAX_SAFE_INTEGER, typeId: "minecraft:water" });
});
