import assert from "node:assert/strict";
import test from "node:test";

import { clockworkTargetAngle, nextClockworkAngle, shortestClockworkDelta } from "../behavior_pack/scripts/contraptions/clockwork-bearing.js";

test("Clockwork bearings map Minecraft day time to hour, minute, and 24-hour hand targets", () => {
	assert.equal(clockworkTargetAngle(0, 0), 180);
	assert.equal(clockworkTargetAngle(0, 1), 0);
	assert.equal(clockworkTargetAngle(6000, 2), 180);
	assert.equal(clockworkTargetAngle(0, 0, -1), 180);
});

test("Clockwork bearings use the shortest bounded kinetic correction", () => {
	assert.equal(shortestClockworkDelta(350, 10), 20);
	assert.equal(shortestClockworkDelta(10, 350), -20);
	assert.equal(nextClockworkAngle(350, 10, 10), 353);
	assert.equal(nextClockworkAngle(10, 350, 0), 10);
});
