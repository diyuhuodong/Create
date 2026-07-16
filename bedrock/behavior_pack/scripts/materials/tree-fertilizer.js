export const TREE_FERTILIZER_ITEM = "createbedrock:tree_fertilizer";

/** Stable vanilla feature IDs that preserve the sapling's native tree family. */
export const SAPLING_FEATURES = Object.freeze({
	"minecraft:acacia_sapling": "minecraft:acacia_tree_feature",
	"minecraft:birch_sapling": "minecraft:select_birch_tree_feature",
	"minecraft:cherry_sapling": "minecraft:cherry_tree_feature",
	"minecraft:dark_oak_sapling": "minecraft:roofed_tree_with_vines_feature",
	"minecraft:jungle_sapling": "minecraft:mega_jungle_tree_feature",
	"minecraft:mangrove_propagule": "minecraft:random_mangrove_tree_feature",
	"minecraft:oak_sapling": "minecraft:random_oak_tree_from_sapling_feature",
	"minecraft:pale_oak_sapling": "minecraft:pale_oak_tree_feature",
	"minecraft:spruce_sapling": "minecraft:pine_tree_feature"
});

export function treeFeatureFor(blockTypeId) {
	return SAPLING_FEATURES[blockTypeId];
}

export function canApplyTreeFertilizer(blockTypeId) {
	return typeof treeFeatureFor(blockTypeId) === "string";
}
