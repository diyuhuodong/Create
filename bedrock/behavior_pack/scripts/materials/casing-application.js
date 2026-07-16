export const CASING_APPLICATIONS = Object.freeze({
	"createbedrock:andesite_alloy": "createbedrock:andesite_casing",
	"createbedrock:brass_ingot": "createbedrock:brass_casing",
	"minecraft:copper_ingot": "createbedrock:copper_casing"
});

const STRIPPED_WOOD_SUFFIX = /^(minecraft:)?stripped_(?:[a-z_]+_)?(?:log|wood)$/;

export function casingForApplication(itemTypeId, blockTypeId) {
	if (typeof itemTypeId !== "string" || typeof blockTypeId !== "string" || !STRIPPED_WOOD_SUFFIX.test(blockTypeId))
		return undefined;
	return CASING_APPLICATIONS[itemTypeId];
}
