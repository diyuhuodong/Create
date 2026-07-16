import assert from "node:assert/strict";
import test from "node:test";

import {
	ROSE_QUARTZ_LAMP_BLOCK,
	collectConnectedRoseQuartzLamps,
	roseQuartzLampInputTransition,
	roseQuartzLampOutputMask,
	roseQuartzLampOutputFaces,
	roseQuartzLampTickTransition
} from "../behavior_pack/scripts/materials/rose-quartz-lamp.js";

test("Rose Quartz Lamp rising edge preserves the Java delayed activation state", () => {
	assert.deepEqual(roseQuartzLampInputTransition({ activate: 0, powered: 0, powering: 0 }, 15), {
		changed: true,
		rising: true,
		state: { activate: 1, powered: 1, powering: 1 }
	});
	assert.deepEqual(roseQuartzLampTickTransition({ activate: 1, powered: 1, powering: 1 }), {
		changed: true,
		state: { activate: 0, powered: 1, powering: 1 }
	});
	assert.deepEqual(roseQuartzLampInputTransition({ activate: 0, powered: 1, powering: 1 }, 0), {
		changed: true,
		rising: false,
		state: { activate: 0, powered: 0, powering: 1 }
	});
});

test("Rose Quartz Lamp resets only connected neighbors within Manhattan distance 16", () => {
	const blocks = new Map([
		["1:0:0", { typeId: ROSE_QUARTZ_LAMP_BLOCK }],
		["2:0:0", { typeId: ROSE_QUARTZ_LAMP_BLOCK }],
		["17:0:0", { typeId: ROSE_QUARTZ_LAMP_BLOCK }],
		["0:1:0", { typeId: ROSE_QUARTZ_LAMP_BLOCK }]
	]);
	const readBlock = location => blocks.get(`${location.x}:${location.y}:${location.z}`);
	assert.deepEqual(collectConnectedRoseQuartzLamps({ anchor: { x: 0, y: 0, z: 0 }, readBlock })
		.map(entry => entry.location), [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 2, y: 0, z: 0 }]);
	assert.deepEqual(roseQuartzLampOutputFaces({ x: 0, y: 0, z: 0 }, readBlock), ["north", "south", "west", "down"]);
	assert.equal(roseQuartzLampOutputMask(["north", "south", "west", "down"]), 45);
});
