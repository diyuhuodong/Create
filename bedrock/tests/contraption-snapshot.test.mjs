import assert from "node:assert/strict";
import test from "node:test";

import {
	createContraptionSnapshot,
	materializeSnapshot,
	normalizeContraptionSnapshot,
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
	assert.equal(snapshot.schemaVersion, 2);
	assert.match(snapshot.checksum, /^[0-9a-f]{8}$/);

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

test("Contraption snapshots upgrade schema v1 and reject a changed schema v2 payload", () => {
	const legacy = {
		schemaVersion: 1,
		anchor: { x: 0, y: 0, z: 0 },
		blocks: [{ relative: { x: 0, y: 0, z: 0 }, typeId: "createbedrock:shaft" }]
	};
	const upgraded = normalizeContraptionSnapshot(legacy);
	assert.equal(upgraded.schemaVersion, 2);
	assert.deepEqual(materializeSnapshot(upgraded, { x: 1, y: 2, z: 3 }), [
		{ location: { x: 1, y: 2, z: 3 }, typeId: "createbedrock:shaft", states: undefined, data: undefined }
	]);

	assert.throws(() => normalizeContraptionSnapshot({
		...upgraded,
		blocks: [{ ...upgraded.blocks[0], typeId: "createbedrock:cogwheel" }]
	}), /checksum mismatch/);
});
