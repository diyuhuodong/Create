import assert from "node:assert/strict";
import test from "node:test";

import {
	MAX_WHISTLE_EXTENSION_HEIGHT,
	nextWhistleSize,
	whistlePitch,
	whistleSoundPitch
} from "../behavior_pack/scripts/materials/steam-whistle.js";

test("steam whistle extension geometry maps to Java semitone pitch", () => {
	assert.equal(whistlePitch([]), 0);
	assert.equal(whistlePitch([0]), 1);
	assert.equal(whistlePitch([1, 1, 0]), 5);
	assert.equal(whistlePitch(Array(MAX_WHISTLE_EXTENSION_HEIGHT).fill(1)), 12);
	assert.equal(whistleSoundPitch(12), 0.5);
});

test("steam whistle cycles its three Java size classes", () => {
	assert.equal(nextWhistleSize(0), 1);
	assert.equal(nextWhistleSize(1), 2);
	assert.equal(nextWhistleSize(2), 0);
});
