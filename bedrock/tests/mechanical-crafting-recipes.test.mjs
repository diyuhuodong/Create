import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { matchMechanicalCraftingRecipe } from "../behavior_pack/scripts/processing/mechanical-crafter.js";
import { buildMechanicalCraftingRecipes, renderMechanicalCraftingRecipes, validateMechanicalCraftingRecipes } from "../tools/mechanical-crafting-recipes.mjs";
import { normalizeLineEndings } from "./test-text.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(testDirectory, "..");
const repositoryRoot = resolve(bedrockRoot, "..");

test("P7.2 mechanical crafting is generated from every Java recipe and preserves mirroring", async () => {
	const generated = await buildMechanicalCraftingRecipes({ repositoryRoot });
	assert.deepEqual(validateMechanicalCraftingRecipes(generated), { recipes: 4 });
	assert.deepEqual(await readFile(resolve(bedrockRoot, "data", "recipes", "mechanical-crafting.json"), "utf8").then(JSON.parse), generated);
	assert.equal(normalizeLineEndings(await readFile(resolve(bedrockRoot, "behavior_pack", "scripts", "processing", "generated", "mechanical-crafting-recipes.js"), "utf8")), renderMechanicalCraftingRecipes(generated.recipes));
	const recipe = generated.recipes.find(entry => entry.id === "create:mechanical_crafting/potato_cannon");
	const grid = recipe.pattern.map((row, rowIndex) => [...row].map(symbol => symbol === " " ? undefined : ({
		C: "minecraft:copper_ingot",
		L: "createbedrock:andesite_alloy",
		R: "createbedrock:precision_mechanism",
		S: "createbedrock:fluid_pipe"
	}[symbol]))).map(row => [...row].reverse());
	assert.equal(matchMechanicalCraftingRecipe(grid)?.id, recipe.id);
	assert.equal(generated.recipes.find(entry => entry.id === "create:mechanical_crafting/crushing_wheel").acceptMirrored, false);
});
