import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeBlockContent, normalizeBlockMenuCategory } from "../tools/block-menu-category-compatibility.mjs";
import { normalizeRecipeUnlocks } from "../tools/recipe-unlock-compatibility.mjs";

const scriptsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "behavior_pack", "scripts");

async function scriptFiles(directory = scriptsRoot) {
	const entries = await readdir(directory, { withFileTypes: true });
	const nested = await Promise.all(entries.map(entry => entry.isDirectory()
		? scriptFiles(resolve(directory, entry.name))
		: entry.name.endsWith(".js") ? [resolve(directory, entry.name)] : []));
	return nested.flat();
}

test("Bedrock runtime scripts use the current item event and import system before scheduling work", async () => {
	for (const file of await scriptFiles()) {
		const source = await readFile(file, "utf8");
		assert.doesNotMatch(source, /world\.afterEvents\.itemUseOn/, `${file} uses the removed itemUseOn event`);
		if (/\bsystem\./.test(source))
			assert.match(source, /import\s*\{[^}]*\bsystem\b[^}]*\}\s*from\s*["']@minecraft\/server["']/, `${file} uses system without importing it`);
	}
});

test("Bedrock persistent runtimes defer world restoration until after early execution", async () => {
	for (const file of await scriptFiles()) {
		const source = await readFile(file, "utf8");
		assert.doesNotMatch(source, /^\s*restore\(\);/m, `${file} restores world state during early execution`);
	}
});

test("Bedrock packages namespace every block menu-category group", () => {
	const definition = {
		"minecraft:block": {
			description: { menu_category: { category: "construction", group: "itemGroup.name.misc" } }
		}
	};
	assert.equal(normalizeBlockMenuCategory(definition), true);
	assert.equal(definition["minecraft:block"].description.menu_category.group, "minecraft:itemGroup.name.misc");
	assert.equal(normalizeBlockMenuCategory(definition), false);
});

test("Bedrock staging fixes invalid block bounds and blend render methods", () => {
	const definition = {
		"minecraft:block": {
			components: {
				"minecraft:collision_box": { origin: [-7, -8, -7], size: [14, 30, 14] },
				"minecraft:selection_box": { origin: [-7, -8, -7], size: [14, 30, 14] },
				"minecraft:material_instances": { "*": { render_method: "alpha_blend" } }
			}
		}
	};
	assert.equal(normalizeBlockContent(definition), true);
	const components = definition["minecraft:block"].components;
	assert.deepEqual(components["minecraft:collision_box"], { origin: [-7, 0, -7], size: [14, 24, 14] });
	assert.deepEqual(components["minecraft:selection_box"], { origin: [-7, 0, -7], size: [14, 16, 14] });
	assert.equal(components["minecraft:material_instances"]["*"].render_method, "blend");
});

test("Bedrock staging unlocks recipes that require current unlock metadata", () => {
	const definition = {
		"minecraft:recipe_shaped": { description: { identifier: "createbedrock:compatibility_test" } },
		"minecraft:recipe_brewing_mix": { description: { identifier: "createbedrock:unchanged" } }
	};
	assert.equal(normalizeRecipeUnlocks(definition), true);
	assert.deepEqual(definition["minecraft:recipe_shaped"].unlock, { context: "AlwaysUnlocked" });
	assert.equal(definition["minecraft:recipe_brewing_mix"].unlock, undefined);
});
