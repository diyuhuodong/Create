import assert from "node:assert/strict";
import test from "node:test";

import { STEAM_ENGINE_CONSUMPTION_PER_TICK, steamEngineOutput } from "../behavior_pack/scripts/kinetics/steam-engine.js";

test("steam engine emits bounded power only for a sufficient water supply", () => {
	assert.deepEqual(steamEngineOutput(undefined), { capacity: 0, consume: 0, speed: 0 });
	assert.deepEqual(steamEngineOutput({ amount: STEAM_ENGINE_CONSUMPTION_PER_TICK - 1, typeId: "minecraft:water" }), { capacity: 0, consume: 0, speed: 0 });
	assert.deepEqual(steamEngineOutput({ amount: STEAM_ENGINE_CONSUMPTION_PER_TICK, typeId: "minecraft:water" }), {
		capacity: 64,
		consume: STEAM_ENGINE_CONSUMPTION_PER_TICK,
		speed: 16
	});
	assert.deepEqual(steamEngineOutput({ amount: STEAM_ENGINE_CONSUMPTION_PER_TICK, tags: ["heated"], typeId: "minecraft:water" }), {
		capacity: 128,
		consume: STEAM_ENGINE_CONSUMPTION_PER_TICK,
		speed: 32
	});
});
