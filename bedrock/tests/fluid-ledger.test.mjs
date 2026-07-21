import assert from "node:assert/strict";
import test from "node:test";

import { FluidLedger } from "../behavior_pack/scripts/fluids/fluid-ledger.js";
import { FluidTank } from "../behavior_pack/scripts/fluids/fluid-tank.js";

function ports(...entries) {
	return id => entries.find(port => port.id === id);
}

test("FluidLedger consumes inputs once and settles outputs after a restart", () => {
	const source = new FluidTank({ capacity: 1_000, contents: { amount: 500, typeId: "minecraft:water" }, id: "ledger:source" });
	const destination = new FluidTank({ capacity: 500, contents: { amount: 500, typeId: "minecraft:water" }, id: "ledger:destination" });
	const ledger = new FluidLedger();
	assert.deepEqual(ledger.begin({
		id: "mix:1",
		inputs: [{ amount: 250, port: source, typeId: "minecraft:water" }],
		outputs: [{ fluid: { amount: 250, typeId: "minecraft:water" }, port: destination }]
	}), { id: "mix:1", ok: true, state: "escrowed" });
	assert.equal(source.inspect().contents.amount, 250);
	assert.deepEqual(ledger.settle("mix:1", ports(source, destination)), { id: "mix:1", ok: false, reason: "output_blocked", state: "escrowed" });

	const restored = new FluidLedger();
	restored.restore(ledger.snapshot());
	destination.extract(destination.reserve({ maxAmount: 250 }));
	assert.deepEqual(restored.settle("mix:1", ports(source, destination)), { id: "mix:1", ok: true, state: "committed" });
	assert.equal(destination.inspect().contents.amount, 500);
	assert.equal(source.inspect().contents.amount, 250);
});

test("FluidLedger rejects a concurrent second claim without creating fluid", () => {
	const source = new FluidTank({ capacity: 500, contents: { amount: 250, typeId: "createbedrock:honey" }, id: "ledger:concurrent" });
	const output = new FluidTank({ capacity: 500, id: "ledger:output" });
	const first = new FluidLedger();
	const second = new FluidLedger();
	assert.equal(first.begin({ id: "first", inputs: [{ amount: 250, port: source, tag: "c:honey" }], outputs: [{ fluid: { amount: 250, typeId: "createbedrock:honey" }, port: output }] }).ok, true);
	assert.deepEqual(second.begin({ id: "second", inputs: [{ amount: 250, port: source, tag: "c:honey" }], outputs: [{ fluid: { amount: 250, typeId: "createbedrock:honey" }, port: output }] }), { id: "second", ok: false, reason: "input_unavailable" });
	assert.equal(first.settle("first", ports(source, output)).ok, true);
	assert.deepEqual(output.inspect().contents, { amount: 250, typeId: "createbedrock:honey" });
});
