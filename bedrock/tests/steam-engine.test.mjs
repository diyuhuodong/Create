import assert from "node:assert/strict";
import test from "node:test";

import { boilerSteamEngineOutput, STEAM_ENGINE_CONSUMPTION_PER_TICK, steamEngineOutput } from "../behavior_pack/scripts/kinetics/steam-engine.js";
import { BURNER_HEAT_LEVEL } from "../behavior_pack/scripts/fluids/heat-level.js";

test("steam engine emits bounded power only for a sufficient water supply", () => {
	assert.deepEqual(steamEngineOutput(undefined), { capacity: 0, consume: 0, speed: 0 });
	assert.deepEqual(steamEngineOutput({ amount: STEAM_ENGINE_CONSUMPTION_PER_TICK - 1, typeId: "minecraft:water" }), { capacity: 0, consume: 0, speed: 0 });
	assert.deepEqual(steamEngineOutput({ amount: STEAM_ENGINE_CONSUMPTION_PER_TICK, typeId: "minecraft:water" }), {
		capacity: 0,
		consume: 0,
		speed: 0
	});
	assert.deepEqual(steamEngineOutput({ amount: STEAM_ENGINE_CONSUMPTION_PER_TICK, typeId: "minecraft:water" }, { heatLevel: BURNER_HEAT_LEVEL.KINDLED }), {
		capacity: 64,
		consume: STEAM_ENGINE_CONSUMPTION_PER_TICK,
		speed: 16
	});
	assert.deepEqual(steamEngineOutput({ amount: STEAM_ENGINE_CONSUMPTION_PER_TICK, typeId: "minecraft:water" }, { heatLevel: BURNER_HEAT_LEVEL.SEETHING }), {
		capacity: 128,
		consume: STEAM_ENGINE_CONSUMPTION_PER_TICK,
		speed: 32
	});
});

test("boiler Steam Engine output uses shared heat level and engine allocation instead of the legacy tiers", () => {
	assert.deepEqual(boilerSteamEngineOutput({ amount: 50, typeId: "minecraft:water" }, {
		activeHeat: 8, engineCount: 4, tankBlocks: 32, waterSamples: [80]
	}), { capacity: 512, consume: 50, speed: 128 });
	assert.deepEqual(boilerSteamEngineOutput({ amount: 50, typeId: "minecraft:water" }, {
		activeHeat: 8, engineCount: 16, tankBlocks: 32, waterSamples: [80]
	}), { capacity: 256, consume: 50, speed: 64 });
});
