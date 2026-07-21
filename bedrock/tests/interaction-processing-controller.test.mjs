import assert from "node:assert/strict";
import test from "node:test";

import { InteractionProcessingController } from "../behavior_pack/scripts/processing/interaction-processing-controller.js";

const recipes = [{
	id: "create:deploying/test_casing",
	ingredients: [
		{ count: 1, kind: "item", typeId: "createbedrock:andesite_alloy" },
		{ count: 1, kind: "tag", tag: "minecraft:stripped_logs" }
	],
	keepHeldItem: false,
	results: [{ chance: 1, count: 1, kind: "item", typeId: "createbedrock:andesite_casing" }],
	source: { type: "create:deploying" },
	strategy: "port_runtime"
}];

test("interaction processing controller commits one matching Deployer recipe through managed ports", () => {
	const controller = new InteractionProcessingController(recipes, { id: "test:deployer" });
	controller.inputPort.insert({ count: 1, typeId: "createbedrock:andesite_alloy" });
	controller.heldPort.insert({ count: 1, typeId: "minecraft:stripped_oak_log" });

	const result = controller.tick({
		matchesTag: (tag, typeId) => tag === "minecraft:stripped_logs" && typeId === "minecraft:stripped_oak_log",
		random: () => 0
	});
	assert.deepEqual(result, {
		accepted: true,
		consumed: {
			fluids: [],
			items: [
				{ count: 1, typeId: "createbedrock:andesite_alloy" },
				{ count: 1, typeId: "minecraft:stripped_oak_log" }
			]
		},
		outputs: { fluids: [], items: [{ count: 1, typeId: "createbedrock:andesite_casing" }] },
		recipeId: "create:deploying/test_casing"
	});
	assert.equal(controller.inputPort.inspect().slots[0], undefined);
	assert.equal(controller.heldPort.inspect().slots[0], undefined);
	const output = controller.outputPort.reserve();
	assert.deepEqual(output.item, { count: 1, typeId: "createbedrock:andesite_casing" });
});

test("interaction processing controller leaves a non-matching input buffered for extraction", () => {
	const controller = new InteractionProcessingController(recipes, { id: "test:reject" });
	controller.inputPort.insert({ count: 1, typeId: "minecraft:stone" });
	controller.heldPort.insert({ count: 1, typeId: "minecraft:stripped_oak_log" });
	assert.deepEqual(controller.tick({ matchesTag: () => true }), { accepted: false, reason: "no_matching_recipe" });
	assert.deepEqual(controller.inputPort.inspect().slots[0], { count: 1, typeId: "minecraft:stone" });
});
