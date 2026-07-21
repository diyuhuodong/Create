export function isSupportedProcessingItem(typeId) {
	// P7.1 generates every Java Create registration as a concrete Bedrock
	// block-item or standalone item. Keep this guard namespace-based rather
	// than duplicating a stale hand-maintained allowlist that silently rejects
	// newly generated palette, material and recipe-chain content.
	return typeof typeId === "string" && (typeId.startsWith("minecraft:") || typeId.startsWith("createbedrock:"));
}

export function supportedProcessingRecipes(recipes) {
	if (!Array.isArray(recipes))
		throw new TypeError("Processing recipe lists must be arrays");
	return recipes.filter(recipe => isSupportedProcessingItem(recipe?.input?.typeId)
		&& recipe.outputs?.every(output => isSupportedProcessingItem(output.typeId)));
}
