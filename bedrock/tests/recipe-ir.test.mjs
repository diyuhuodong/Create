import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildRecipeIr, validateRecipeIr } from "../tools/recipe-ir.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(testDirectory, "..");
const repositoryRoot = resolve(bedrockRoot, "..");

test("P7.2 recipe IR losslessly classifies every Java recipe and preserves sequenced fluid steps", async () => {
	const generated = await buildRecipeIr({ repositoryRoot });
	assert.equal(generated.summary.recipes, 1_884);
	assert.deepEqual(validateRecipeIr(generated).recipes, 1_884);
	const persisted = await readFile(resolve(bedrockRoot, "data", "recipes", "recipe-ir.json"), "utf8").then(JSON.parse);
	assert.deepEqual(persisted, generated);

	const precision = generated.recipes.find(recipe => recipe.id === "create:sequenced_assembly/precision_mechanism");
	assert.equal(precision.strategy, "scripted_interaction");
	assert.equal(precision.processing.loops, 5);
	assert.equal(precision.processing.sequence.length, 3);
	assert.equal(precision.results.find(result => result.typeId === "createbedrock:precision_mechanism")?.chance, 120);

	const sturdy = generated.recipes.find(recipe => recipe.id === "create:sequenced_assembly/sturdy_sheet");
	assert.deepEqual(sturdy.processing.sequence[0].ingredients.find(ingredient => ingredient.kind === "fluid"), {
		amount: 500,
		kind: "fluid",
		path: "sequence[0].ingredients[1]",
		sourceId: "minecraft:lava",
		typeId: "minecraft:lava"
	});
	assert.equal(generated.summary.strategies.external_compat > 0, true);
});
