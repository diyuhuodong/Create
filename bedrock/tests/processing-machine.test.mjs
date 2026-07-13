import assert from "node:assert/strict";
import test from "node:test";

import { ProcessingMachine } from "../behavior_pack/scripts/processing/processing-machine.js";

const recipes = [{
	id: "create:processing/ore",
	input: { typeId: "minecraft:raw_iron", count: 1 },
	outputs: [
		{ chance: 1, count: 2, typeId: "minecraft:iron_nugget" },
		{ chance: 0.5, count: 1, typeId: "minecraft:gold_nugget" }
	],
	processingTicks: 2
}];

test("ProcessingMachine persists buffered input, in-process escrow, and output delivery", () => {
	const machine = new ProcessingMachine(recipes, { id: "test:machine" });
	assert.deepEqual(machine.insertInput({ count: 1, typeId: "minecraft:raw_iron" }).accepted, { count: 1, typeId: "minecraft:raw_iron" });
	assert.equal(machine.tick({ powered: false }), undefined);
	assert.equal(machine.tick({ powered: true }).started, true);
	assert.equal(machine.tick({ powered: true }).completed, false);
	assert.equal(machine.tick({ powered: true }).completed, true);
	assert.equal(machine.inspect().pendingOutputs.length, 1);

	const restored = new ProcessingMachine(recipes, { id: "test:machine" });
	restored.restore(machine.snapshot());
	assert.equal(restored.tick({ powered: false }).delivered.count, 2);
	assert.deepEqual(restored.extractOutput(), { count: 2, typeId: "minecraft:iron_nugget" });
	assert.equal(restored.hasContents(), false);
});

test("ProcessingMachine fixes chance results when work starts and retains a full output escrow", () => {
	const machine = new ProcessingMachine(recipes, { id: "test:chance", outputSlots: 1 });
	assert.equal(machine.tryInsert({ count: 1, typeId: "minecraft:raw_iron" }, { random: () => 0.4 }).recipeId, "create:processing/ore");
	machine.tick({ powered: true });
	machine.tick({ powered: true });
	machine.tick({ powered: false });
	assert.deepEqual(machine.extractOutput(), { count: 2, typeId: "minecraft:iron_nugget" });
	machine.tick({ powered: false });
	assert.deepEqual(machine.extractOutput(), { count: 1, typeId: "minecraft:gold_nugget" });

	assert.equal(machine.tryInsert({ count: 1, typeId: "minecraft:raw_iron" }, { random: () => 0.9 }).recipeId, "create:processing/ore");
	machine.tick({ powered: true });
	machine.tick({ powered: true });
	machine.tick({ powered: false });
	assert.deepEqual(machine.extractOutput(), { count: 2, typeId: "minecraft:iron_nugget" });
	assert.equal(machine.extractOutput(), undefined);
});

test("ProcessingMachine rejects unsupported input without taking ownership", () => {
	const machine = new ProcessingMachine(recipes, { id: "test:unsupported" });
	assert.deepEqual(machine.insertInput({ count: 1, typeId: "minecraft:stone" }), {
		accepted: undefined,
		remainder: { count: 1, typeId: "minecraft:stone" }
	});
	assert.equal(machine.hasContents(), false);
});
