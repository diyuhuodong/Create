import assert from "node:assert/strict";
import test from "node:test";

import { boilerEngineEfficiency, boilerHeatForSize, boilerHeatForWater, boilerHeatLevel } from "../behavior_pack/scripts/kinetics/boiler-model.js";

test("BoilerData sizing and sampled water caps match Java's observable level rules", () => {
	assert.equal(boilerHeatForSize(3), 0);
	assert.equal(boilerHeatForSize(72), 18);
	assert.equal(boilerHeatForWater([0, 1, 10, 11]), 1);
	assert.equal(boilerHeatLevel({ activeHeat: 8, tankBlocks: 16, waterSamples: [90] }), 4);
});

test("BoilerData distributes active and passive engine efficiency without a fixed output tier", () => {
	assert.deepEqual(boilerEngineEfficiency({ activeHeat: 6, engineCount: 2, tankBlocks: 24, waterSamples: [60] }), { efficiency: 1, heatLevel: 6 });
	assert.deepEqual(boilerEngineEfficiency({ activeHeat: 6, engineCount: 8, tankBlocks: 24, waterSamples: [60] }), { efficiency: .75, heatLevel: 6 });
	assert.deepEqual(boilerEngineEfficiency({ passiveHeat: true, engineCount: 4, tankBlocks: 4, waterSamples: [10] }), { efficiency: .03125, heatLevel: 1 });
});
