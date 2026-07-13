import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
	mapJavaProcessingIdentifier,
	processingImportReport,
	supportsProcessingRecipeItems
} from "../tools/processing-recipe-import.js";

test("processing recipe import maps Create identifiers and records every source outcome", () => {
	assert.equal(mapJavaProcessingIdentifier("create:wheat_flour"), "createbedrock:wheat_flour");
	assert.equal(mapJavaProcessingIdentifier("minecraft:wheat"), "minecraft:wheat");
	assert.equal(supportsProcessingRecipeItems(["minecraft:wheat", "createbedrock:wheat_flour"]), true);
	assert.equal(supportsProcessingRecipeItems(["createbedrock:brass_ingot"]), false);

	assert.deepEqual(processingImportReport("milling", [
		{ source: "unsupported", status: "unsupported_dependency", reason: "unavailable_item" },
		{ source: "migrated", status: "migrated", recipeId: "create:milling/migrated", recipeIds: ["create:milling/migrated"] },
		{ source: "shape", status: "manual_specification", reason: "unsupported_recipe_shape" }
	]), {
		processor: "milling",
		schemaVersion: 1,
		summary: {
			manual_specification: 1,
			migrated: 1,
			unsupported_dependency: 1
		},
		records: [
			{ source: "migrated", status: "migrated", recipeId: "create:milling/migrated", recipeIds: ["create:milling/migrated"] },
			{ source: "shape", status: "manual_specification", reason: "unsupported_recipe_shape" },
			{ source: "unsupported", status: "unsupported_dependency", reason: "unavailable_item" }
		]
	});
});

test("generated processor reports classify every Java recipe without silent skips", async () => {
	for (const processor of ["milling", "pressing", "crushing"]) {
		const file = new URL(`../data/recipes/${processor}-import-report.json`, import.meta.url);
		const report = JSON.parse(await readFile(file, "utf8"));
		const reconstructed = processingImportReport(report.processor, report.records);
		assert.deepEqual(report, reconstructed);
		assert.equal(report.processor, processor);
		assert.ok(report.summary.migrated > 0);
		assert.ok(report.summary.unsupported_dependency > 0);
		assert.ok(report.summary.manual_specification > 0);
		assert.equal(report.records.length, Object.values(report.summary).reduce((total, value) => total + value, 0));
	}
});
