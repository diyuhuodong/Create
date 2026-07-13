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
	assert.equal(wheel.tryInsert({ typeId: "minecraft:amethyst_block", count: 1 }).recipeId, "create:crushing/amethyst");
	assert.equal(wheel.tick(0), undefined);
	assert.equal(wheel.tick(16).completed, false);
	assert.deepEqual(wheel.tick(16, () => 0.4).outputs, [
		{ typeId: "minecraft:amethyst_shard", count: 3, chance: 1 },
		{ typeId: "minecraft:amethyst_shard", count: 1, chance: 0.5 }
	]);
});
