import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeBlockContent, normalizeBlockMenuCategory, normalizeItemContent } from "../tools/block-menu-category-compatibility.mjs";
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

test("Bedrock staging keeps alpha-test material groups internally consistent", () => {
	const definition = {
		"minecraft:block": {
			components: {
				"minecraft:material_instances": {
					canvas: { render_method: "alpha_test" },
					frame: { render_method: "opaque" }
				}
			}
		}
	};
	assert.equal(normalizeBlockContent(definition), true);
	assert.equal(definition["minecraft:block"].components["minecraft:material_instances"].frame.render_method, "alpha_test");
});

test("Bedrock staging gives conflicting placeholder recipes distinct valid ingredients", () => {
	const definition = {
		"minecraft:recipe_shapeless": {
			description: { identifier: "createbedrock:redstone_link" },
			ingredients: [{ item: "minecraft:redstone" }, { item: "createbedrock:andesite_alloy" }],
			result: { item: "createbedrock:redstone_link" }
		}
	};
	assert.equal(normalizeRecipeUnlocks(definition), true);
	assert.deepEqual(definition["minecraft:recipe_shapeless"].ingredients.at(-1), { item: "minecraft:ender_pearl" });
});

test("Bedrock staging keeps material render modes compatible and removes only invalid sliding-door transforms", () => {
	const door = {
		"minecraft:block": {
			description: { identifier: "createbedrock:brass_door" },
			components: {
				"minecraft:item_visual": {
					material_instances: {
						"*": { render_method: "blend" },
						frame: { render_method: "opaque" }
					}
				}
			},
			permutations: [{ components: { "minecraft:transformation": { translation: [8, 0, 0] } } }]
		}
	};
	assert.equal(normalizeBlockContent(door), true);
	assert.equal(door["minecraft:block"].permutations[0].components["minecraft:transformation"], undefined);
	assert.equal(door["minecraft:block"].components["minecraft:item_visual"].material_instances.frame.render_method, "blend");

	const nonDoor = {
		"minecraft:block": {
			description: { identifier: "createbedrock:cardboard" },
			permutations: [{ components: { "minecraft:transformation": { translation: [8, 0, 0] } } }]
		}
	};
	assert.equal(normalizeBlockContent(nonDoor), false);
	assert.deepEqual(nonDoor["minecraft:block"].permutations[0].components["minecraft:transformation"], { translation: [8, 0, 0] });
});

test("Bedrock staging uses a safe inventory geometry only for models rejected by Bedrock item visuals", () => {
	const deployer = {
		"minecraft:block": {
			description: { identifier: "createbedrock:deployer" },
			components: {
				"minecraft:geometry": "geometry.createbedrock.deployer",
				"minecraft:item_visual": { geometry: { identifier: "geometry.createbedrock.deployer" } }
			}
		}
	};
	assert.equal(normalizeBlockContent(deployer), true);
	assert.equal(deployer["minecraft:block"].components["minecraft:geometry"], "minecraft:geometry.full_block");
	assert.equal(deployer["minecraft:block"].components["minecraft:item_visual"].geometry.identifier, "minecraft:geometry.full_block");

	const verticalGearbox = {
		"minecraft:block": {
			description: { identifier: "createbedrock:vertical_gearbox" },
			components: {
				"minecraft:geometry": "geometry.createbedrock.gearbox",
				"minecraft:item_visual": { geometry: { identifier: "geometry.createbedrock.gearbox" } }
			}
		}
	};
	assert.equal(normalizeBlockContent(verticalGearbox), true);
	assert.equal(verticalGearbox["minecraft:block"].components["minecraft:geometry"], "minecraft:geometry.full_block");
	assert.equal(verticalGearbox["minecraft:block"].components["minecraft:item_visual"].geometry.identifier, "minecraft:geometry.full_block");
});

test("Bedrock staging uses current state and menu schemas for block and item definitions", () => {
	const block = {
		"minecraft:block": {
			description: {
				menu_category: { group: "itemGroup.name.misc" },
				properties: { "createbedrock:powered": [0, 1] }
			},
			components: { "minecraft:material_instances": { "*": { render_method: "blend" } } }
		}
	};
	assert.equal(normalizeBlockContent(block), true);
	assert.deepEqual(block["minecraft:block"].description.states, { "createbedrock:powered": [0, 1] });
	assert.equal(block["minecraft:block"].description.properties, undefined);
	assert.equal(block["minecraft:block"].description.menu_category.group, "minecraft:itemGroup.name.misc");
	assert.equal(block["minecraft:block"].components["minecraft:geometry"], "minecraft:geometry.full_block");

	const item = { "minecraft:item": { description: { menu_category: { group: "itemGroup.name.misc" } } } };
	assert.equal(normalizeItemContent(item), true);
	assert.equal(item["minecraft:item"].description.menu_category.group, "minecraft:itemGroup.name.misc");
});

test("Bedrock staging unlocks recipes that require current unlock metadata", () => {
	const definition = {
		"minecraft:recipe_shaped": { description: { identifier: "createbedrock:compatibility_test" }, result: { count: 4, item: "createbedrock:schedule" } },
		"minecraft:recipe_brewing_mix": { description: { identifier: "createbedrock:unchanged" } }
	};
	assert.equal(normalizeRecipeUnlocks(definition), true);
	assert.deepEqual(definition["minecraft:recipe_shaped"].unlock, { context: "AlwaysUnlocked" });
	assert.equal(definition["minecraft:recipe_shaped"].result.count, 1);
	assert.equal(definition["minecraft:recipe_brewing_mix"].unlock, undefined);
});

test("Bedrock staging uses valid discriminators without changing zinc decompacting", () => {
	const contact = {
		"minecraft:recipe_shapeless": {
			description: { identifier: "createbedrock:redstone_contact" },
			ingredients: [], result: { item: "createbedrock:redstone_contact" }
		}
	};
	const copycatPanel = {
		"minecraft:recipe_shapeless": {
			description: { identifier: "createbedrock:copycat_panel" },
			ingredients: [{ item: "createbedrock:zinc_ingot" }], result: { item: "createbedrock:copycat_panel" }
		}
	};
	assert.equal(normalizeRecipeUnlocks(contact), true);
	assert.equal(normalizeRecipeUnlocks(copycatPanel), true);
	assert.deepEqual(contact["minecraft:recipe_shapeless"].ingredients.at(-1), { item: "minecraft:heavy_weighted_pressure_plate" });
	assert.deepEqual(copycatPanel["minecraft:recipe_shapeless"].ingredients.at(-1), { item: "minecraft:slime_ball" });
});
