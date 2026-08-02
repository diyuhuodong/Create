import assert from "node:assert/strict";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

import { buildSequencedAssemblyRecipes, renderSequencedAssemblyRecipes, validateSequencedAssemblyRecipes } from "../tools/sequenced-assembly-recipes.mjs";
import { normalizeLineEndings } from "./test-text.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(testDirectory, "..");
const repositoryRoot = resolve(bedrockRoot, "..");

test("P7.2 sequenced-assembly IR preserves every Java recipe, loop, step, probability, and fluid amount", async () => {
	const generated = await buildSequencedAssemblyRecipes({ repositoryRoot });
	assert.deepEqual(validateSequencedAssemblyRecipes(generated), { recipes: 3, steps: 9 });
	const precision = generated.recipes.find(recipe => recipe.source === "precision_mechanism");
	assert.deepEqual(precision.input, { count: 1, kind: "tag", tag: "c:plates/gold" });
	assert.equal(precision.loops, 5);
	assert.deepEqual(precision.steps.map(step => step.type), ["create:deploying", "create:deploying", "create:deploying"]);
	assert.equal(precision.outputs[0].typeId, "createbedrock:precision_mechanism");
	assert.equal(precision.outputs[0].chance, 120);
	const sturdySheet = generated.recipes.find(recipe => recipe.source === "sturdy_sheet");
	assert.deepEqual(sturdySheet.steps[0].ingredients[1], { amount: 500, kind: "fluid", typeId: "minecraft:lava" });
	const persisted = await readFile(resolve(bedrockRoot, "data", "recipes", "sequenced-assembly.json"), "utf8").then(JSON.parse);
	assert.deepEqual(persisted, generated);
	assert.equal(normalizeLineEndings(await readFile(resolve(bedrockRoot, "behavior_pack", "scripts", "processing", "generated", "sequenced-assembly-recipes.js"), "utf8")), renderSequencedAssemblyRecipes(generated.recipes));
});
