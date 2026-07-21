import assert from "node:assert/strict";
import test from "node:test";

import { STEAM_ENGINE_CONSUMPTION_PER_TICK, steamEngineOutput } from "../behavior_pack/scripts/kinetics/steam-engine.js";
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
