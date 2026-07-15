import assert from "node:assert/strict";
import test from "node:test";

import { CrushingWheelMachine } from "../behavior_pack/scripts/processing/crushing-wheel-machine.js";

test("CrushingWheelMachine pauses without kinetic speed and preserves bonus outputs", () => {
	const wheel = new CrushingWheelMachine([{
		id: "create:crushing/amethyst",
		input: { typeId: "minecraft:amethyst_block", count: 1 },
		processingTicks: 2,
		outputs: [
			{ typeId: "minecraft:amethyst_shard", count: 3, chance: 1 },
			{ typeId: "minecraft:amethyst_shard", count: 1, chance: 0.5 }
		]
	}]);
	assert.equal(wheel.tryInsert({ typeId: "minecraft:amethyst_block", count: 1 }, { random: () => 0.4 }).recipeId, "create:crushing/amethyst");
	assert.equal(wheel.tick(0), undefined);
	assert.equal(wheel.tick(16).completed, false);
	assert.deepEqual(wheel.tick(16).outputs, [
		{ typeId: "minecraft:amethyst_shard", count: 3, chance: 1 },
		{ typeId: "minecraft:amethyst_shard", count: 1, chance: 0.5 }
	]);
});

test("CrushingWheelMachine resumes a captured in-progress batch at a re-keyed assembly location", () => {
	const recipes = [{
		id: "create:crushing/copper",
		input: { typeId: "minecraft:copper_ore", count: 1 },
		outputs: [{ typeId: "minecraft:raw_copper", count: 2, chance: 1 }],
		processingTicks: 3
	}];
	const source = new CrushingWheelMachine(recipes, { id: "crushing-wheel:source" });
	assert.deepEqual(source.insertInput({ typeId: "minecraft:copper_ore", count: 1 }).accepted, { typeId: "minecraft:copper_ore", count: 1 });
	assert.equal(source.tick(16).started, true);
	assert.equal(source.tick(16).completed, false);
	const moved = new CrushingWheelMachine(recipes, { id: "crushing-wheel:target" });
	moved.restore(source.snapshot());
	assert.equal(moved.tick(16).completed, false);
	assert.deepEqual(moved.tick(16).outputs, [{ typeId: "minecraft:raw_copper", count: 2, chance: 1 }]);
});

test("CrushingWheelMachine exposes recipe-filtered managed input and output automation ports", () => {
	const machine = new CrushingWheelMachine([{
		id: "create:crushing/iron",
		input: { typeId: "minecraft:iron_ore", count: 1 },
		outputs: [{ typeId: "minecraft:raw_iron", count: 1, chance: 1 }],
		processingTicks: 1
	}], { id: "crushing-wheel:automation" });
	assert.equal(machine.inputPort.transactionStorage, "managed");
	assert.equal(machine.outputPort.transactionStorage, "managed");
	assert.deepEqual(machine.inputPort.insert({ count: 1, typeId: "minecraft:dirt" }), {
		accepted: undefined,
		remainder: { count: 1, typeId: "minecraft:dirt" }
	});
	assert.deepEqual(machine.inputPort.insert({ count: 1, typeId: "minecraft:iron_ore" }).accepted, {
		count: 1,
		typeId: "minecraft:iron_ore"
	});
	assert.equal(machine.tick(16).started, true);
	assert.equal(machine.tick(16).completed, true);
	assert.deepEqual(machine.tick(16).delivered, { count: 1, typeId: "minecraft:raw_iron" });
	assert.deepEqual(machine.outputPort.extract(machine.outputPort.reserve()), { count: 1, typeId: "minecraft:raw_iron" });
});
