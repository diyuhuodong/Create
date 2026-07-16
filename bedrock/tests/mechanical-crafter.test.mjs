import assert from "node:assert/strict";
import test from "node:test";

import {
	crafterWorkTicks,
	mechanicalCrafterIngredientMatches,
	mechanicalCrafterPlane,
	matchMechanicalCraftingRecipe
} from "../behavior_pack/scripts/processing/mechanical-crafter.js";

test("Mechanical crafter matches the full sparse crushing-wheel grid", () => {
	const grid = [
		[undefined, "createbedrock:andesite_alloy", "createbedrock:andesite_alloy", "createbedrock:andesite_alloy", undefined],
		["createbedrock:andesite_alloy", "createbedrock:andesite_alloy", "minecraft:oak_planks", "createbedrock:andesite_alloy", "createbedrock:andesite_alloy"],
		["createbedrock:andesite_alloy", "minecraft:oak_planks", "minecraft:stone", "minecraft:oak_planks", "createbedrock:andesite_alloy"],
		["createbedrock:andesite_alloy", "createbedrock:andesite_alloy", "minecraft:oak_planks", "createbedrock:andesite_alloy", "createbedrock:andesite_alloy"],
		[undefined, "createbedrock:andesite_alloy", "createbedrock:andesite_alloy", "createbedrock:andesite_alloy", undefined]
	];
	assert.deepEqual(matchMechanicalCraftingRecipe(grid), {
		id: "create:mechanical_crafting/crushing_wheel",
		output: { count: 2, typeId: "createbedrock:crushing_wheel" }
	});
});

test("Mechanical crafter tags, plane selection, and speed timing are deterministic", () => {
	assert.equal(mechanicalCrafterIngredientMatches({ tag: "minecraft:planks" }, "minecraft:cherry_planks"), true);
	assert.equal(mechanicalCrafterIngredientMatches({ tag: "c:stones" }, "minecraft:dirt"), false);
	assert.deepEqual(mechanicalCrafterPlane(1), ["x", "z"]);
	assert.deepEqual(mechanicalCrafterPlane("east"), ["z", "y"]);
	assert.equal(crafterWorkTicks(0), undefined);
	assert.equal(crafterWorkTicks(32), 7);
});
