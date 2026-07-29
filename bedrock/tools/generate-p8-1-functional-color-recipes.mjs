import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { COLORED_NIXIE_TUBE_BLOCKS, COLORED_SAIL_BLOCKS } from "../behavior_pack/scripts/kernel/functional-color-families.js";

const bedrockRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const recipeRoot = resolve(bedrockRoot, "behavior_pack", "recipes", "generated", "p8_1", "functional_colors");

function identifier(typeId) {
	return typeId.slice("createbedrock:".length);
}

function color(typeId, suffix) {
	return identifier(typeId).slice(0, -`_${suffix}`.length);
}

function recolorRecipe(typeId, suffix, base) {
	const target = identifier(typeId);
	return {
		format_version: "1.26.0",
		"minecraft:recipe_shapeless": {
			description: { identifier: `createbedrock:p8_1/${target}_from_dye` },
			tags: ["crafting_table"],
			ingredients: [
				{ item: base },
				{ item: `minecraft:${color(typeId, suffix)}_dye` }
			],
			result: { item: typeId }
		}
	};
}

async function writeJson(file, value) {
	await mkdir(dirname(file), { recursive: true });
	await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

await rm(recipeRoot, { force: true, recursive: true });
for (const typeId of COLORED_NIXIE_TUBE_BLOCKS)
	await writeJson(resolve(recipeRoot, `${identifier(typeId)}_from_dye.json`), recolorRecipe(typeId, "nixie_tube", "createbedrock:nixie_tube"));
for (const typeId of COLORED_SAIL_BLOCKS)
	await writeJson(resolve(recipeRoot, `${identifier(typeId)}_from_dye.json`), recolorRecipe(typeId, "sail", "createbedrock:white_sail"));

console.log(`Generated ${COLORED_NIXIE_TUBE_BLOCKS.length + COLORED_SAIL_BLOCKS.length} P8.1 functional-color recolor recipes.`);
