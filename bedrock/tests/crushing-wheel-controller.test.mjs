import assert from "node:assert/strict";
import test from "node:test";

import { resolveCrushingWheelControllerPair } from "../behavior_pack/scripts/processing/crushing-wheel-controller.js";

const controller = { x: 0, y: 64, z: 0 };

test("Crushing Wheel Controller only activates for opposing, counter-rotating wheel pairs", () => {
	const resolved = resolveCrushingWheelControllerPair({
		controller,
		wheels: [
			{ axis: "y", location: { x: -1, y: 64, z: 0 }, speed: 128 },
			{ axis: "y", location: { x: 1, y: 64, z: 0 }, speed: -64 }
		]
	});
	assert.deepEqual(resolved, { active: true, rotationAxis: "y", separationAxis: "x", speed: 64 });
});

test("Crushing Wheel Controller rejects wheels that share rotation direction or an invalid axle", () => {
	assert.deepEqual(resolveCrushingWheelControllerPair({
		controller,
		wheels: [
			{ axis: "y", location: { x: -1, y: 64, z: 0 }, speed: 64 },
			{ axis: "y", location: { x: 1, y: 64, z: 0 }, speed: 64 }
		]
	}), { active: false, speed: 0 });
	assert.deepEqual(resolveCrushingWheelControllerPair({
		controller,
		wheels: [
			{ axis: "x", location: { x: -1, y: 64, z: 0 }, speed: 64 },
			{ axis: "x", location: { x: 1, y: 64, z: 0 }, speed: -64 }
		]
	}), { active: false, speed: 0 });
});
