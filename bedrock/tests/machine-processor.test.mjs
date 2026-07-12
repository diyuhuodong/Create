import assert from "node:assert/strict";
import test from "node:test";

import { MachineProcessor } from "../behavior_pack/scripts/processing/machine-processor.js";

const recipes = [{
	id: "create:milling/wheat",
	input: { typeId: "minecraft:wheat", count: 1 },
	processingTicks: 3,
	outputs: [
		{ typeId: "createbedrock:wheat_flour", count: 1, chance: 1 },
		{ typeId: "minecraft:wheat_seeds", count: 1, chance: 0.25 }
	]
}];

test("MachineProcessor consumes once, pauses without power, and emits deterministic outputs", () => {
	const processor = new MachineProcessor(recipes);
	assert.deepEqual(processor.start({ typeId: "minecraft:wheat", count: 1 }), {
		consumed: { typeId: "minecraft:wheat", count: 1 },
		recipeId: "create:milling/wheat"
	});
	assert.equal(processor.start({ typeId: "minecraft:wheat", count: 1 }), false);
	assert.equal(processor.tick({ powered: false }), undefined);
	assert.deepEqual(processor.tick({ powered: true }), {
		completed: false,
		progress: 1,
		recipeId: "create:milling/wheat"
	});
	processor.tick({ powered: true });
	assert.deepEqual(processor.tick({ powered: true, random: () => 0.5 }), {
		completed: true,
		outputs: [{ typeId: "createbedrock:wheat_flour", count: 1, chance: 1 }],
		recipeId: "create:milling/wheat"
	});
});

test("MachineProcessor restores in-progress work", () => {
	const processor = new MachineProcessor(recipes);
	processor.start({ typeId: "minecraft:wheat", count: 1 });
	processor.tick({ powered: true });
	const restored = new MachineProcessor(recipes);
	restored.restore(processor.snapshot());

	assert.equal(restored.tick({ powered: true }).progress, 2);
	assert.equal(restored.tick({ powered: true }).completed, true);
});
