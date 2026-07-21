import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { mapJavaProcessingIdentifier } from "./processing-recipe-import.js";

export async function processingTagProjections(bedrockRoot) {
	const document = JSON.parse(await readFile(resolve(bedrockRoot, "data", "recipes", "tag-projections.json"), "utf8"));
	return new Map(document.records
		.filter(record => record.status === "emittable")
		.map(record => [record.tag, record.items]));
}

export function expandProcessingIngredient(ingredient, tagItems) {
	const count = ingredient?.count ?? 1;
	if (!Number.isInteger(count) || count < 1)
		return [];
	if (typeof ingredient?.item === "string")
		return [{ count, typeId: mapJavaProcessingIdentifier(ingredient.item) }];
	if (typeof ingredient?.tag === "string")
		return (tagItems.get(ingredient.tag) ?? []).map(typeId => ({ count, typeId }));
	return [];
}
