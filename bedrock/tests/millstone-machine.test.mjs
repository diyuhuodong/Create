import assert from "node:assert/strict";
import test from "node:test";

import { MillstoneMachine } from "../behavior_pack/scripts/processing/millstone-machine.js";

const recipes = [{
	id: "create:milling/wheat",
	input: { typeId: "minecraft:wheat", count: 1 },
	processingTicks: 2,
	outputs: [{ typeId: "createbedrock:wheat_flour", count: 1, chance: 1 }]
}];

test("MillstoneMachine requires kinetic speed before completing work", () => {
	const millstone = new MillstoneMachine(recipes);
	assert.equal(millstone.tryInsert({ typeId: "minecraft:wheat", count: 1 }).recipeId, "create:milling/wheat");
	assert.equal(millstone.tick(0), undefined);
	assert.equal(millstone.tick(16).completed, false);
	assert.deepEqual(millstone.tick(-16).outputs, [{ typeId: "createbedrock:wheat_flour", count: 1, chance: 1 }]);
});
