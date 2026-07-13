import assert from "node:assert/strict";
import test from "node:test";

import { FluidPort } from "../behavior_pack/scripts/fluids/fluid-port.js";
import { cloneFluidStack, fluidStackFingerprint } from "../behavior_pack/scripts/fluids/fluid-stack.js";
import { FluidTank } from "../behavior_pack/scripts/fluids/fluid-tank.js";
import { FluidTransferJournal } from "../behavior_pack/scripts/fluids/fluid-transfer-journal.js";

function ports(...ports) {
	return id => ports.find(port => port.id === id);
}

test("FluidTank conserves capacity and never mixes incompatible virtual fluids", () => {
	const tank = new FluidTank({ capacity: 1000, id: "tank:mix" });
	assert.deepEqual(tank.insert({ amount: 750, tags: ["clear", "cold", "clear"], typeId: "minecraft:water" }), {
		accepted: { amount: 750, tags: ["clear", "cold"], typeId: "minecraft:water" },
		remainder: undefined
	});
	assert.deepEqual(tank.insert({ amount: 500, tags: ["cold", "clear"], typeId: "minecraft:water" }), {
		accepted: { amount: 250, tags: ["clear", "cold"], typeId: "minecraft:water" },
		remainder: { amount: 250, tags: ["clear", "cold"], typeId: "minecraft:water" }
	});
	assert.deepEqual(tank.insert({ amount: 1, typeId: "minecraft:lava" }), {
		accepted: undefined,
		remainder: { amount: 1, typeId: "minecraft:lava" }
	});
	assert.equal(tank.inspect().contents.amount, 1000);
	assert.equal(fluidStackFingerprint({ amount: 1, tags: ["cold", "clear"], typeId: "minecraft:water" }), fluidStackFingerprint({ amount: 1, tags: ["clear", "cold"], typeId: "minecraft:water" }));
	assert.throws(() => cloneFluidStack({ amount: 1.5, typeId: "minecraft:water" }), /safe integers/);
});

test("FluidTank extraction receipts survive restarts without extracting twice", () => {
	const source = new FluidTank({ capacity: 1000, contents: { amount: 500, temperature: 20, typeId: "minecraft:water" }, id: "tank:source" });
	const reservation = source.reserve({ maxAmount: 300 });
	assert.deepEqual(source.extract(reservation, { receiptId: "transfer:extract" }), { amount: 300, temperature: 20, typeId: "minecraft:water" });
	const restored = new FluidTank({ capacity: 1000, id: "tank:source" });
	restored.restore(source.snapshot());
	assert.deepEqual(restored.extract(reservation, { receiptId: "transfer:extract" }), { amount: 300, temperature: 20, typeId: "minecraft:water" });
	assert.deepEqual(restored.inspect().contents, { amount: 200, temperature: 20, typeId: "minecraft:water" });
});

test("FluidPort enforces direction and acceptance policies without mutating its tank", () => {
	const tank = new FluidTank({ capacity: 1000, id: "tank:port" });
	const input = new FluidPort({
		accepts: fluid => fluid.typeId === "minecraft:water",
		extractionEnabled: false,
		tank
	});
	assert.deepEqual(input.insert({ amount: 250, typeId: "minecraft:lava" }), {
		accepted: undefined,
		remainder: { amount: 250, typeId: "minecraft:lava" }
	});
	assert.deepEqual(input.insert({ amount: 250, typeId: "minecraft:water" }).accepted, { amount: 250, typeId: "minecraft:water" });
	assert.equal(input.reserve(), undefined);
	assert.throws(() => input.extract({ fluid: { amount: 1, typeId: "minecraft:water" }, revision: 1, tankId: "tank:port" }), /does not allow extraction/);
});

test("FluidTransferJournal preserves escrow across a restart and partial delivery", () => {
	const source = new FluidTank({ capacity: 1000, contents: { amount: 700, typeId: "minecraft:water" }, id: "tank:source" });
	const destination = new FluidTank({ capacity: 300, contents: { amount: 300, typeId: "minecraft:water" }, id: "tank:destination" });
	const first = new FluidTransferJournal();
	assert.equal(first.begin({ destination, id: "fluid:restart", maxAmount: 500, source }).ok, true);
	assert.deepEqual(first.settle("fluid:restart", ports(source, destination)), { ok: false, reason: "destination_full", state: "escrowed" });

	const restored = new FluidTransferJournal();
	restored.restore(first.snapshot());
	destination.extract(destination.reserve());
	assert.deepEqual(restored.settle("fluid:restart", ports(source, destination)), { ok: false, reason: "destination_full", state: "escrowed" });
	assert.deepEqual(destination.inspect().contents, { amount: 300, typeId: "minecraft:water" });
	destination.extract(destination.reserve());
	assert.deepEqual(restored.settle("fluid:restart", ports(source, destination)), { ok: true, state: "committed" });
	assert.deepEqual(destination.inspect().contents, { amount: 200, typeId: "minecraft:water" });
	assert.deepEqual(source.inspect().contents, { amount: 200, typeId: "minecraft:water" });
});

test("FluidTransferJournal rejects a stale concurrent reservation without creating fluid", () => {
	const source = new FluidTank({ capacity: 1000, contents: { amount: 600, typeId: "minecraft:water" }, id: "tank:source" });
	const firstDestination = new FluidTank({ capacity: 1000, id: "tank:destination-a" });
	const secondDestination = new FluidTank({ capacity: 1000, id: "tank:destination-b" });
	const first = new FluidTransferJournal();
	const second = new FluidTransferJournal();
	first.begin({ destination: firstDestination, id: "fluid:first", maxAmount: 400, source });
	second.begin({ destination: secondDestination, id: "fluid:second", maxAmount: 400, source });
	assert.deepEqual(first.settle("fluid:first", ports(source, firstDestination, secondDestination)), { ok: true, state: "committed" });
	assert.equal(second.settle("fluid:second", ports(source, firstDestination, secondDestination)).reason, "source_changed");
	assert.deepEqual(source.inspect().contents, { amount: 200, typeId: "minecraft:water" });
	assert.deepEqual(firstDestination.inspect().contents, { amount: 400, typeId: "minecraft:water" });
	assert.equal(secondDestination.inspect().contents, undefined);
});
