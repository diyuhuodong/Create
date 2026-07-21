import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildNativeRecipes, renderNativeRecipeFiles, validateNativeRecipes } from "../tools/native-recipes.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(testDirectory, "..");
const repositoryRoot = resolve(bedrockRoot, "..");

test("P7.2 native compiler classifies every Java-native recipe without losing its source identity", async () => {
	const generated = await buildNativeRecipes({ bedrockRoot, repositoryRoot });
	assert.equal(generated.summary.recipes, 1_005);
	assert.deepEqual(validateNativeRecipes(generated).recipes, 1_005);
	const persisted = await readFile(resolve(bedrockRoot, "data", "recipes", "native.json"), "utf8").then(JSON.parse);
	assert.deepEqual(persisted, generated);
	assert.equal(generated.summary.status.blocked_missing_content, 0);
	assert.equal(generated.summary.status.blocked_tag_projection, 0);
	assert.equal(generated.summary.status.blocked_platform_semantics > 0, true);
});

test("P7.2 native compiler emits only executable Bedrock definitions and retains generated identifiers", async () => {
	const generated = await buildNativeRecipes({ bedrockRoot, repositoryRoot });
	const shaft = generated.records.find(record => record.id === "create:crafting/kinetics/shaft");
	assert.equal(shaft.nativeId, "createbedrock:p7_2/crafting/kinetics/shaft");
	assert.equal(shaft.definition?.["minecraft:recipe_shaped"]?.result.item, "createbedrock:shaft");
	assert.equal(shaft.definition?.["minecraft:recipe_shaped"]?.key.A.item, "createbedrock:andesite_alloy");

	const files = renderNativeRecipeFiles(generated);
	for (const [file, contents] of files) {
		assert.match(file, /^p7_2\//);
		assert.doesNotThrow(() => JSON.parse(contents));
	}
	const definitionCount = generated.records
		.filter(record => record.status === "emittable")
		.reduce((count, record) => count + record.definitions.length, 0);
	assert.equal(files.size, definitionCount);
	assert.ok(files.size > generated.summary.status.emittable);
});
