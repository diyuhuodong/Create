const TAG_ITEMS = Object.freeze({
	"c:dusts/obsidian": Object.freeze(["createbedrock:powdered_obsidian"]),
	"c:nuggets/iron": Object.freeze(["minecraft:iron_nugget"]),
	"c:nuggets/zinc": Object.freeze(["createbedrock:zinc_nugget"]),
	"c:plates/gold": Object.freeze(["createbedrock:golden_sheet"]),
	"create:sleepers": Object.freeze([
		"minecraft:andesite_slab",
		"minecraft:smooth_stone_slab",
		"minecraft:stone_slab"
	])
});

/**
 * Exact Bedrock projection of the five item tags used by Create's three
 * sequenced-assembly recipes. Keep this separate from the Java `c:` names:
 * Bedrock's native recipe tags cannot represent Create's cross-loader tags.
 */
export function matchesSequencedAssemblyTag(tag, typeId) {
	if (typeof tag !== "string" || typeof typeId !== "string")
		return false;
	return TAG_ITEMS[tag]?.includes(typeId) ?? false;
}

export function sequencedAssemblyTagItems(tag) {
	if (typeof tag !== "string")
		throw new TypeError("Sequenced-assembly tag lookups require a string tag");
	return [...(TAG_ITEMS[tag] ?? [])];
}
