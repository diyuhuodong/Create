import assert from "node:assert/strict";
import test from "node:test";

import { createSymmetryState, parseSymmetryState, resolveSymmetryTargets, serializeSymmetryState } from "../behavior_pack/scripts/schematics/symmetry-state.js";

test("Symmetry Wand state is bounded and survives per-item serialization", () => {
	const state = createSymmetryState({ center: { x: 4, y: 60, z: -2 }, mode: "rotate_4" });
	assert.deepEqual(parseSymmetryState(serializeSymmetryState(state)), state);
	assert.throws(() => createSymmetryState({ center: { x: .5, y: 1, z: 1 } }), /integer/);
});

test("Symmetry Wand resolves only bounded, deduplicated copies", () => {
	assert.deepEqual(resolveSymmetryTargets({
		center: { x: 0, y: 10, z: 0 }, mode: "mirror_x", source: { x: 2, y: 10, z: 3 }
	}), [{ x: -2, y: 10, z: 3 }]);
	assert.deepEqual(resolveSymmetryTargets({
		center: { x: 0, y: 10, z: 0 }, mode: "rotate_4", source: { x: 1, y: 10, z: 0 }
	}), [{ x: -1, y: 10, z: 0 }, { x: 0, y: 10, z: -1 }, { x: 0, y: 10, z: 1 }]);
});
