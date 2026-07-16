const REGISTERED_CREATE_ITEMS = new Set([
	"createbedrock:andesite_alloy",
	"createbedrock:andesite_alloy_block",
	"createbedrock:brass_ingot",
	"createbedrock:copper_sheet",
	"createbedrock:copper_nugget",
	"createbedrock:crushed_raw_copper",
	"createbedrock:crushed_raw_gold",
	"createbedrock:crushed_raw_iron",
	"createbedrock:crushed_raw_zinc",
	"createbedrock:deepslate_zinc_ore",
	"createbedrock:experience_nugget",
	"createbedrock:golden_sheet",
	"createbedrock:iron_sheet",
	"createbedrock:raw_zinc",
	"createbedrock:raw_zinc_block",
	"createbedrock:rose_quartz",
	"createbedrock:shaft",
	"createbedrock:wheat_flour",
	"createbedrock:zinc_ingot",
	"createbedrock:zinc_nugget",
	"createbedrock:zinc_ore"
]);

export function isSupportedProcessingItem(typeId) {
	return typeof typeId === "string" && (!typeId.startsWith("createbedrock:") || REGISTERED_CREATE_ITEMS.has(typeId));
}

export function supportedProcessingRecipes(recipes) {
	if (!Array.isArray(recipes))
		throw new TypeError("Processing recipe lists must be arrays");
	return recipes.filter(recipe => isSupportedProcessingItem(recipe?.input?.typeId)
		&& recipe.outputs?.every(output => isSupportedProcessingItem(output.typeId)));
}
