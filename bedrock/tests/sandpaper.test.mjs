import assert from "node:assert/strict";
import test from "node:test";

import {
	copperTransformFor,
	nextDurability,
	polishedOutputFor,
	RED_SAND_PAPER,
	SAND_PAPER
} from "../behavior_pack/scripts/materials/sandpaper.js";

test("both sand papers polish Java rose quartz and break on their eighth use", () => {
	assert.equal(polishedOutputFor("createbedrock:rose_quartz"), "createbedrock:polished_rose_quartz");
	assert.equal(polishedOutputFor(SAND_PAPER), undefined);
	assert.equal(polishedOutputFor(RED_SAND_PAPER), undefined);
	assert.deepEqual(nextDurability({ damage: 6, maxDurability: 8 }), { damage: 7, broken: false });
	assert.deepEqual(nextDurability({ damage: 7, maxDurability: 8 }), { damage: 8, broken: true });
});

test("sand paper scrapes oxidation or removes wax across vanilla copper families", () => {
	assert.equal(copperTransformFor("minecraft:oxidized_copper_grate"), "minecraft:weathered_copper_grate");
	assert.equal(copperTransformFor("minecraft:weathered_cut_copper_slab"), "minecraft:exposed_cut_copper_slab");
	assert.equal(copperTransformFor("minecraft:exposed_copper_door"), "minecraft:copper_door");
	assert.equal(copperTransformFor("minecraft:waxed_oxidized_copper_trapdoor"), "minecraft:oxidized_copper_trapdoor");
	assert.equal(copperTransformFor("minecraft:stone"), undefined);
});
