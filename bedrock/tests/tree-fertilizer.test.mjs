import assert from "node:assert/strict";
import test from "node:test";

import { canApplyTreeFertilizer, treeFeatureFor } from "../behavior_pack/scripts/materials/tree-fertilizer.js";

test("Tree Fertilizer maps supported saplings to their stable native tree features", () => {
	assert.equal(treeFeatureFor("minecraft:oak_sapling"), "minecraft:random_oak_tree_from_sapling_feature");
	assert.equal(treeFeatureFor("minecraft:mangrove_propagule"), "minecraft:random_mangrove_tree_feature");
	assert.equal(canApplyTreeFertilizer("minecraft:stone"), false);
});
