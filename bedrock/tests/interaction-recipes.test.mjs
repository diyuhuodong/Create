import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildInteractionRecipes, renderInteractionRecipes, validateInteractionRecipes } from "../tools/interaction-recipes.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(testDirectory, "..");
const repositoryRoot = resolve(bedrockRoot, "..");

test("P7.2 interaction IR preserves every direct Create deployment, filling, emptying, application, and polishing recipe", async () => {
	const generated = await buildInteractionRecipes({ repositoryRoot });
	const coverage = validateInteractionRecipes(generated);
	assert.equal(coverage.records, 202);
	assert.equal(coverage.status.compiled + coverage.status.external_compat + coverage.status.manual_specification, 202);
	assert.equal(coverage.status.manual_specification, 0);
	const persisted = await readFile(resolve(bedrockRoot, "data", "recipes", "interactions.json"), "utf8").then(JSON.parse);
	assert.deepEqual(persisted, generated);
	assert.equal(await readFile(resolve(bedrockRoot, "behavior_pack", "scripts", "processing", "generated", "interaction-recipes.js"), "utf8"), renderInteractionRecipes(generated.recipes));

	const tea = generated.recipes.find(recipe => recipe.id === "create:emptying/builders_tea");
	assert.deepEqual(tea.results.find(result => result.kind === "fluid"), {
		amount: 250,
		chance: 1,
		kind: "fluid",
		sourceId: "create:tea",
		typeId: "createbedrock:tea"
	});
	const waxRemoval = generated.recipes.find(recipe => recipe.id === "create:deploying/chiseled_copper_from_removing_wax");
	assert.equal(waxRemoval.keepHeldItem, true);
});
