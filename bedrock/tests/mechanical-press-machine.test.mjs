import assert from "node:assert/strict";
import test from "node:test";

import { MechanicalPressMachine } from "../behavior_pack/scripts/processing/mechanical-press-machine.js";

test("MechanicalPressMachine consumes kinetic work before producing a sheet", () => {
	const press = new MechanicalPressMachine([{
		id: "create:pressing/iron",
		input: { typeId: "minecraft:iron_ingot", count: 1 },
		processingTicks: 2,
		outputs: [{ typeId: "createbedrock:iron_sheet", count: 1, chance: 1 }]
	}]);
	assert.equal(press.tryInsert({ typeId: "minecraft:iron_ingot", count: 1 }).recipeId, "create:pressing/iron");
	assert.equal(press.tick(0), undefined);
	assert.equal(press.tick(16).completed, false);
	assert.deepEqual(press.tick(16).outputs, [{ typeId: "createbedrock:iron_sheet", count: 1, chance: 1 }]);
});
