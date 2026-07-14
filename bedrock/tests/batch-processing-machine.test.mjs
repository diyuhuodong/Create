import assert from "node:assert/strict";
import test from "node:test";

import { BatchProcessingMachine } from "../behavior_pack/scripts/processing/batch-processing-machine.js";

const recipes = [
	{
		id: "create:basin/alloy",
		ingredients: [
			{ count: 1, typeId: "minecraft:andesite" },
			{ count: 2, typeId: "minecraft:iron_nugget" }
		],
		mode: "mixing",
		outputs: [
			{ chance: 1, count: 1, typeId: "createbedrock:andesite_alloy" },
			{ chance: 0.5, count: 1, typeId: "minecraft:gold_nugget" }
		],
		processingTicks: 2
	},
	{
		id: "create:basin/compact",
		ingredients: [{ count: 2, typeId: "minecraft:snow_block" }],
		mode: "compacting",
		outputs: [{ chance: 1, count: 1, typeId: "minecraft:ice" }],
		processingTicks: 1
	}
];

function insertAll(machine) {
	assert.deepEqual(machine.insertInput({ count: 1, typeId: "minecraft:andesite" }).accepted, { count: 1, typeId: "minecraft:andesite" });
	assert.deepEqual(machine.insertInput({ count: 2, typeId: "minecraft:iron_nugget" }).accepted, { count: 2, typeId: "minecraft:iron_nugget" });
}

test("BatchProcessingMachine matches all ingredients, consumes them once, and pauses for the wrong controller", () => {
	const machine = new BatchProcessingMachine(recipes, { id: "test:batch" });
	insertAll(machine);
	assert.equal(machine.tick({ mode: "cutting", powered: true }), undefined);
	assert.equal(machine.tick({ mode: "mixing", powered: true, random: () => 0.9 }).started, true);
	assert.equal(machine.peekInput(), undefined);
	assert.equal(machine.tick({ mode: "compacting", powered: true }).paused, true);
	assert.equal(machine.tick({ mode: "mixing", powered: true }).completed, false);
	assert.equal(machine.tick({ mode: "mixing", powered: true }).completed, true);
	assert.equal(machine.tick({ mode: "mixing", powered: false }).delivered.count, 1);
	assert.deepEqual(machine.extractOutput(), { count: 1, typeId: "createbedrock:andesite_alloy" });
	assert.equal(machine.extractOutput(), undefined);
});

test("BatchProcessingMachine preserves decided random outputs and pending output escrow over a restart", () => {
	const machine = new BatchProcessingMachine(recipes, { id: "test:restart", outputSlots: 1 });
	insertAll(machine);
	machine.tick({ mode: "mixing", powered: true, random: () => 0.4 });
	machine.tick({ mode: "mixing", powered: true });
	machine.tick({ mode: "mixing", powered: true });
	const restored = new BatchProcessingMachine(recipes, { id: "test:restart", outputSlots: 1 });
	restored.restore(machine.snapshot());
	assert.equal(restored.tick({ powered: false }).delivered.count, 1);
	assert.deepEqual(restored.extractOutput(), { count: 1, typeId: "createbedrock:andesite_alloy" });
	assert.equal(restored.tick({ powered: false }).delivered.count, 1);
	assert.deepEqual(restored.extractOutput(), { count: 1, typeId: "minecraft:gold_nugget" });
	assert.equal(restored.hasContents(), false);
});

test("BatchProcessingMachine serializes repeated scheduler ticks without double-consuming a batch", () => {
	const machine = new BatchProcessingMachine(recipes, { id: "test:concurrency" });
	assert.deepEqual(machine.insertInput({ count: 2, typeId: "minecraft:andesite" }).accepted, { count: 2, typeId: "minecraft:andesite" });
	assert.deepEqual(machine.insertInput({ count: 4, typeId: "minecraft:iron_nugget" }).accepted, { count: 4, typeId: "minecraft:iron_nugget" });
	assert.equal(machine.tick({ mode: "mixing", powered: true, random: () => 0.9 }).started, true);
	assert.equal(machine.tick({ mode: "mixing", powered: true }).completed, false);
	assert.equal(machine.tick({ mode: "mixing", powered: true }).completed, true);
	assert.equal(machine.tick({ powered: false }).delivered.count, 1);
	assert.deepEqual(machine.extractOutput(), { count: 1, typeId: "createbedrock:andesite_alloy" });
	assert.equal(machine.tick({ mode: "mixing", powered: true, random: () => 0.9 }).started, true);
	assert.equal(machine.inspect().input.slots.filter(Boolean).length, 0);
});

test("BatchProcessingMachine rejects unsupported input and does not start incomplete batches", () => {
	const machine = new BatchProcessingMachine(recipes, { id: "test:failure" });
	assert.deepEqual(machine.insertInput({ count: 1, typeId: "minecraft:stone" }), {
		accepted: undefined,
		remainder: { count: 1, typeId: "minecraft:stone" }
	});
	assert.deepEqual(machine.insertInput({ count: 1, typeId: "minecraft:andesite" }).accepted, { count: 1, typeId: "minecraft:andesite" });
	assert.equal(machine.tick({ mode: "mixing", powered: true }), undefined);
	assert.deepEqual(machine.extractInput(), { count: 1, typeId: "minecraft:andesite" });
	assert.equal(machine.hasContents(), false);
});
