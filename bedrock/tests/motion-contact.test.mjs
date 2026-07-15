import assert from "node:assert/strict";
import test from "node:test";

import { MotionContactTracker } from "../behavior_pack/scripts/contraptions/motion-contact.js";

const east = { "minecraft:facing_direction": "east" };
const west = { "minecraft:facing_direction": "west" };

function assembly({ id, transform = { rotationMilliDegrees: 0, translation: { x: 0, y: 0, z: 0 } }, states = east }) {
	return {
		dimensionId: "minecraft:overworld",
		id,
		snapshot: {
			anchor: { x: 0, y: 64, z: 0 },
			blocks: [{ relative: { x: 0, y: 0, z: 0 }, states, typeId: "createbedrock:redstone_contact" }]
		},
		transform
	};
}

test("MotionContactTracker emits exactly one rise and fall for a moving contact against the world", () => {
	const tracker = new MotionContactTracker();
	const readWorldContact = (dimensionId, location) => dimensionId === "minecraft:overworld" && location.x === 1 && location.y === 64 && location.z === 0
		? { states: west, typeId: "createbedrock:redstone_contact" }
		: undefined;
	const first = tracker.sample({ assemblies: [assembly({ id: "bearing:a" })], readWorldContact });
	assert.deepEqual(first.map(change => change.active), [true, true]);
	assert.equal(first.find(change => change.endpoint.kind === "world")?.endpoint.location.x, 1);
	assert.deepEqual(tracker.sample({ assemblies: [assembly({ id: "bearing:a" })], readWorldContact }), []);
	const moved = tracker.sample({
		assemblies: [assembly({ id: "bearing:a", transform: { rotationMilliDegrees: 0, translation: { x: 4096, y: 0, z: 0 } } })],
		readWorldContact
	});
	assert.deepEqual(moved.map(change => change.active), [false, false]);
});

test("MotionContactTracker requires opposing faces and tracks assembly-to-assembly contacts", () => {
	const tracker = new MotionContactTracker();
	const left = assembly({ id: "bearing:left", states: east });
	const right = assembly({
		id: "bearing:right",
		states: west,
		transform: { rotationMilliDegrees: 0, translation: { x: 4096, y: 0, z: 0 } }
	});
	const rising = tracker.sample({ assemblies: [left, right], readWorldContact() {} });
	assert.deepEqual(rising.map(change => change.endpoint.kind), ["assembly", "assembly"]);
	assert.deepEqual(tracker.releaseAssembly("bearing:left").map(change => change.active), [false, false]);
	const wrongFacing = tracker.sample({
		assemblies: [left, assembly({ id: "bearing:right", transform: right.transform, states: east })],
		readWorldContact() {}
	});
	assert.deepEqual(wrongFacing, []);
});

test("MotionContactTracker ignores rotated contacts until their transformed face is grid-aligned", () => {
	const tracker = new MotionContactTracker();
	const diagonal = assembly({ id: "bearing:diagonal", transform: { rotationMilliDegrees: 45000, translation: { x: 0, y: 0, z: 0 } } });
	assert.deepEqual(tracker.sample({
		assemblies: [diagonal],
		readWorldContact() { return { states: west, typeId: "createbedrock:redstone_contact" }; }
	}), []);
});
