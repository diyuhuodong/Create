import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(testDirectory, "..");

async function readJson(...parts) {
    return JSON.parse(await readFile(resolve(bedrockRoot, ...parts), "utf8"));
}

test("S3-8A foundation blocks expose explicit drops and source-texture atlas entries", async () => {
    const identifiers = [
        "zinc_ore",
        "deepslate_zinc_ore",
        "raw_zinc_block",
        "weathered_iron_block",
        "andesite_alloy_block",
        "rose_quartz_block"
    ];
    const terrainAtlas = await readJson("resource_pack", "textures", "terrain_texture.json");

    for (const identifier of identifiers) {
        const block = await readJson("behavior_pack", "blocks", `${identifier}.json`);
        const definition = block["minecraft:block"];
        const components = definition.components;
        const lootPath = components["minecraft:loot"];
        const loot = await readJson("behavior_pack", lootPath);

        assert.equal(definition.description.identifier, `createbedrock:${identifier}`);
        assert.equal(definition.description.menu_category.category, "items");
		assert.equal(components["minecraft:geometry"], `geometry.createbedrock:${identifier}`.replace(":", "."));
		assert.equal(components["minecraft:item_visual"].geometry.identifier, `geometry.createbedrock:${identifier}`.replace(":", "."));
        for (const material of Object.values(components["minecraft:material_instances"]))
            assert.ok(terrainAtlas.texture_data[material.texture]);
        assert.equal(loot.pools[0].entries[0].type, "item");
    }
});

test("S3-8A foundation recipes preserve the direct Java material paths", async () => {
    const [alloy, alloyBlock, alloyUnpack, roseQuartz, roseQuartzBlock, rawBlock, rawZinc, zincBlock, zincIngot, furnace, weathered] = await Promise.all([
        readJson("behavior_pack", "recipes", "andesite_alloy.json"),
        readJson("behavior_pack", "recipes", "andesite_alloy_block.json"),
        readJson("behavior_pack", "recipes", "andesite_alloy_from_block.json"),
        readJson("behavior_pack", "recipes", "rose_quartz.json"),
        readJson("behavior_pack", "recipes", "rose_quartz_block.json"),
        readJson("behavior_pack", "recipes", "raw_zinc_block.json"),
        readJson("behavior_pack", "recipes", "raw_zinc_from_raw_zinc_block.json"),
        readJson("behavior_pack", "recipes", "zinc_block.json"),
        readJson("behavior_pack", "recipes", "zinc_ingot_from_zinc_block.json"),
        readJson("behavior_pack", "recipes", "zinc_ingot_from_raw_zinc.json"),
        readJson("behavior_pack", "recipes", "weathered_iron_block.json")
    ]);

    assert.equal(alloy["minecraft:recipe_shaped"].result.item, "createbedrock:andesite_alloy");
    assert.equal(alloy["minecraft:recipe_shaped"].key.A.item, "minecraft:andesite");
    assert.equal(alloyBlock["minecraft:recipe_shaped"].result.item, "createbedrock:andesite_alloy_block");
    assert.equal(alloyUnpack["minecraft:recipe_shapeless"].result.item, "createbedrock:andesite_alloy");
    assert.equal(alloyUnpack["minecraft:recipe_shapeless"].result.count, 9);
    assert.equal(roseQuartz["minecraft:recipe_shapeless"].ingredients.length, 9);
    assert.equal(roseQuartz["minecraft:recipe_shapeless"].result.item, "createbedrock:rose_quartz");
    assert.equal(roseQuartzBlock["minecraft:recipe_shapeless"].tags[0], "stonecutter");
    assert.equal(roseQuartzBlock["minecraft:recipe_shapeless"].result.item, "createbedrock:rose_quartz_block");
    assert.equal(roseQuartzBlock["minecraft:recipe_shapeless"].result.count, 2);
    assert.equal(rawBlock["minecraft:recipe_shaped"].result.item, "createbedrock:raw_zinc_block");
    assert.equal(rawBlock["minecraft:recipe_shaped"].key["#"].item, "createbedrock:raw_zinc");
    assert.equal(rawZinc["minecraft:recipe_shapeless"].ingredients[0].item, "createbedrock:raw_zinc_block");
    assert.equal(rawZinc["minecraft:recipe_shapeless"].result.item, "createbedrock:raw_zinc");
    assert.equal(rawZinc["minecraft:recipe_shapeless"].result.count, 9);
    assert.equal(zincBlock["minecraft:recipe_shaped"].result.item, "createbedrock:zinc_block");
    assert.equal(zincBlock["minecraft:recipe_shaped"].key["#"].item, "createbedrock:zinc_ingot");
    assert.equal(zincIngot["minecraft:recipe_shapeless"].ingredients[0].item, "createbedrock:zinc_block");
    assert.equal(zincIngot["minecraft:recipe_shapeless"].result.item, "createbedrock:zinc_ingot");
    assert.equal(zincIngot["minecraft:recipe_shapeless"].result.count, 9);
    assert.deepEqual(furnace["minecraft:recipe_furnace"].tags, ["furnace", "blast_furnace"]);
    assert.equal(furnace["minecraft:recipe_furnace"].input, "createbedrock:raw_zinc");
    assert.equal(furnace["minecraft:recipe_furnace"].output, "createbedrock:zinc_ingot");
    assert.equal(weathered["minecraft:recipe_shapeless"].tags[0], "stonecutter");
    assert.equal(weathered["minecraft:recipe_shapeless"].result.item, "createbedrock:weathered_iron_block");
    assert.equal(weathered["minecraft:recipe_shapeless"].result.count, 2);
});
