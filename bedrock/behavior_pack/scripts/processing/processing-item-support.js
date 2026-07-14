const REGISTERED_CREATE_ITEMS = new Set([
	"createbedrock:andesite_alloy",
	"createbedrock:andesite_alloy_block",
	"createbedrock:copper_sheet",
	"createbedrock:golden_sheet",
	"createbedrock:iron_sheet",
	"createbedrock:raw_zinc",
	"createbedrock:rose_quartz",
	"createbedrock:shaft",
	"createbedrock:wheat_flour",
	"createbedrock:zinc_ingot"
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
