import assert from "node:assert/strict";
import test from "node:test";

import {
	GAUGE_COLOR,
	gaugeComparatorSignal,
	gaugeDisplayLevel,
	gaugeReading,
	speedGaugeDialTarget,
	stressGaugeDialTarget
} from "../behavior_pack/scripts/materials/gauge.js";

test("Speedometer follows Create's default slow, medium, fast, and over-max dial ranges", () => {
	assert.equal(speedGaugeDialTarget(0), 0);
	assert.equal(speedGaugeDialTarget(30), 0.45);
	assert.equal(speedGaugeDialTarget(100), 0.75);
	assert.equal(speedGaugeDialTarget(256), 1.125);
	assert.equal(gaugeComparatorSignal(speedGaugeDialTarget(30)), 7);
	assert.equal(gaugeDisplayLevel(speedGaugeDialTarget(256)), 15);
});

test("Stressometer reports stopped, loaded, and overloaded kinetic networks", () => {
	assert.equal(stressGaugeDialTarget({ speed: 0, stressCapacity: 256, stressImpact: 128 }), 0);
	assert.equal(stressGaugeDialTarget({ speed: 16, stressCapacity: 256, stressImpact: 128 }), 0.5);
	assert.equal(stressGaugeDialTarget({ overloaded: true, speed: 16, stressCapacity: 256, stressImpact: 512 }), 1.125);
	const overloaded = gaugeReading("stress", { overloaded: true, speed: 16, stressCapacity: 256, stressImpact: 512 });
	assert.deepEqual(overloaded, { color: GAUGE_COLOR.RED, displayLevel: 15, signal: 15, target: 1.125 });
});
