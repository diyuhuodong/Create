import assert from "node:assert/strict";
import test from "node:test";

import { casingForApplication } from "../behavior_pack/scripts/materials/casing-application.js";

test("casing application only accepts the Java stripped-log input family and supported materials", () => {
	assert.equal(casingForApplication("createbedrock:andesite_alloy", "minecraft:stripped_oak_log"), "createbedrock:andesite_casing");
	assert.equal(casingForApplication("createbedrock:brass_ingot", "minecraft:stripped_cherry_wood"), "createbedrock:brass_casing");
	assert.equal(casingForApplication("minecraft:copper_ingot", "minecraft:stripped_bamboo_block"), undefined);
	assert.equal(casingForApplication("minecraft:iron_ingot", "minecraft:stripped_oak_log"), undefined);
	assert.equal(casingForApplication("createbedrock:andesite_alloy", "minecraft:oak_log"), undefined);
});
