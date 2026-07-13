import assert from "node:assert/strict";
import test from "node:test";

import {
	createContraptionSnapshot,
	materializeSnapshot,
	rotateSnapshotY
} from "../behavior_pack/scripts/contraptions/contraption-snapshot.js";

test("Contraption snapshots preserve connected blocks and persistent data", () => {
	const snapshot = createContraptionSnapshot({
		anchor: { x: 10, y: 64, z: 10 },
		blocks: [
			{ location: { x: 10, y: 64, z: 10 }, typeId: "createbedrock:shaft", states: { axis: "x" } },
			{ location: { x: 11, y: 64, z: 10 }, typeId: "createbedrock:millstone", data: { progress: 4 } }
		]
	});

	assert.deepEqual(materializeSnapshot(snapshot, { x: 0, y: 80, z: 0 }), [
		{ location: { x: 0, y: 80, z: 0 }, typeId: "createbedrock:shaft", states: { axis: "x" }, data: undefined },
		{ location: { x: 1, y: 80, z: 0 }, typeId: "createbedrock:millstone", states: undefined, data: { progress: 4 } }
	]);
});

test("Contraption snapshots reject disconnected assemblies", () => {
	assert.throws(() => createContraptionSnapshot({
		anchor: { x: 0, y: 0, z: 0 },
		blocks: [
			{ location: { x: 0, y: 0, z: 0 }, typeId: "createbedrock:shaft" },
			{ location: { x: 2, y: 0, z: 0 }, typeId: "createbedrock:shaft" }
		]
	}), /face-connected/);
});

test("Contraption snapshots rotate around their anchor in quarter turns", () => {
	const snapshot = createContraptionSnapshot({
		anchor: { x: 0, y: 0, z: 0 },
		blocks: [
			{ location: { x: 0, y: 0, z: 0 }, typeId: "createbedrock:shaft" },
			{
				location: { x: 1, y: 0, z: 0 },
				typeId: "createbedrock:shaft",
				states: { "minecraft:facing_direction": 2 }
			}
		]
	});

	const rotated = rotateSnapshotY(snapshot, 1);
	assert.deepEqual(materializeSnapshot(rotated, { x: 5, y: 5, z: 5 }).map(block => block.location), [
		{ x: 5, y: 5, z: 5 },
		{ x: 5, y: 5, z: 6 }
	]);
	assert.equal(rotated.blocks.find(block => block.relative.z === 1).states["minecraft:facing_direction"], 5);
});
