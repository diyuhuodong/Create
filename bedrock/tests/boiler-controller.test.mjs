import assert from "node:assert/strict";
import test from "node:test";

import { BOILER_SAMPLE_WINDOW, createBoilerController, evaluateBoilerController, observeBoilerWater, sampleBoilerWater } from "../behavior_pack/scripts/kinetics/boiler-controller.js";

test("Boiler controller retains a bounded sampled supply history and assigns one efficiency to every engine", () => {
	let controller = createBoilerController({ activeHeat: 8, engineIds: ["engine:b", "engine:a"], members: Array.from({ length: 32 }, (_, index) => ({ index })) });
	for (let sample = 0; sample < BOILER_SAMPLE_WINDOW + 3; sample++)
		controller = sampleBoilerWater(controller, 80);
	assert.equal(controller.waterSamples.length, BOILER_SAMPLE_WINDOW);
	assert.deepEqual(evaluateBoilerController(controller), {
		efficiency: 1,
		engines: { "engine:a": 1, "engine:b": 1 },
		heatLevel: 8,
		waterSamples: Array.from({ length: BOILER_SAMPLE_WINDOW }, () => 80)
	});
});

test("Boiler water observations sample only positive admitted deltas and survive restore", () => {
	let controller = createBoilerController({ memberWater: { tank: 100 }, members: [{}] });
	controller = observeBoilerWater(controller, { tank: 150 });
	controller = createBoilerController(controller);
	for (const amount of [200, 250, 300, 350])
		controller = observeBoilerWater(controller, { tank: amount });
	assert.equal(controller.gatheredSupply, 0);
	assert.deepEqual(controller.waterSamples, [50]);
	for (const amount of [300, 250, 200, 150, 100])
		controller = observeBoilerWater(controller, { tank: amount });
	assert.deepEqual(controller.waterSamples, [50, 0]);
});

test("Boiler controller validates and preserves restart-safe inflow observations", () => {
	const controller = createBoilerController({
		gatheredSupply: 40,
		memberWater: { "fluid-tank:overworld:0:0:0": 500 },
		members: [{ x: 0, y: 0, z: 0 }],
		sampleTicks: 4
	});
	assert.equal(createBoilerController(controller).gatheredSupply, 40);
	assert.equal(createBoilerController(controller).memberWater["fluid-tank:overworld:0:0:0"], 500);
	assert.throws(() => createBoilerController({ members: [{}], sampleTicks: 5 }), /sample ticks/);
});
