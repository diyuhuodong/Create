import assert from "node:assert/strict";
import test from "node:test";

import {
	captureMovingBlockData,
	detachMovingBlockData,
	registerMovingBlockDataAdapter,
	restoreMovingBlockData
} from "../behavior_pack/scripts/contraptions/moving-block-data.js";

test("moving block data adapters transfer state through capture, detach, and restore", () => {
	const state = new Map([["minecraft:overworld:1:64:1", { progress: 12 }]]);
	const key = (dimensionId, location) => `${dimensionId}:${location.x}:${location.y}:${location.z}`;
	registerMovingBlockDataAdapter("test:machine", {
		capture(dimensionId, location) {
			return state.get(key(dimensionId, location));
		},
		detach(dimensionId, location) {
			const value = state.get(key(dimensionId, location));
			state.delete(key(dimensionId, location));
			return value;
		},
		restore(dimensionId, location, value) {
			state.set(key(dimensionId, location), value);
		}
	});

	const source = { x: 1, y: 64, z: 1 };
	const target = { x: 3, y: 64, z: 1 };
	assert.deepEqual(captureMovingBlockData("test:machine", "minecraft:overworld", source), { progress: 12 });
	assert.deepEqual(detachMovingBlockData("test:machine", "minecraft:overworld", source), { progress: 12 });
	assert.equal(captureMovingBlockData("test:machine", "minecraft:overworld", source), undefined);
	restoreMovingBlockData("test:machine", "minecraft:overworld", target, { progress: 12 });
	assert.deepEqual(captureMovingBlockData("test:machine", "minecraft:overworld", target), { progress: 12 });
});
