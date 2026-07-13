import assert from "node:assert/strict";
import test from "node:test";

import { findContraptionCollision } from "../behavior_pack/scripts/contraptions/contraption-collision.js";
import { createContraptionSnapshot } from "../behavior_pack/scripts/contraptions/contraption-snapshot.js";

function snapshot() {
	return createContraptionSnapshot({
		anchor: { x: 0, y: 64, z: 0 },
		blocks: [
			{ location: { x: 0, y: 64, z: 0 }, typeId: "createbedrock:shaft" },
			{ location: { x: 1, y: 64, z: 0 }, typeId: "createbedrock:cogwheel" }
		]
	});
}

test("findContraptionCollision checks a swept conservative footprint", () => {
	const collision = findContraptionCollision({
		snapshot: snapshot(),
		origin: { x: 0, y: 64, z: 0 },
		startRotation: 0,
		endRotation: 90,
		readBlock: location => location.x === 0 && location.y === 64 && location.z === 1
			? { typeId: "minecraft:stone" }
			: { typeId: "minecraft:air" }
	});

	assert.deepEqual(collision.location, { x: 0, y: 64, z: 1 });
	assert.equal(collision.reason, "world_blocked");
});

test("findContraptionCollision ignores air and validates rotation inputs", () => {
	assert.equal(findContraptionCollision({
		snapshot: snapshot(),
		origin: { x: 0, y: 64, z: 0 },
		startRotation: 0,
		endRotation: 90,
		readBlock: () => ({ typeId: "minecraft:air" })
	}), undefined);
	assert.throws(() => findContraptionCollision({
		snapshot: snapshot(),
		origin: { x: 0, y: 64, z: 0 },
		startRotation: Number.NaN,
		endRotation: 90,
		readBlock: () => undefined
	}), /rotations must be finite/);
});

test("findContraptionCollision uses the short path across the zero-degree boundary", () => {
	let reads = 0;
	assert.equal(findContraptionCollision({
		snapshot: snapshot(),
		origin: { x: 0, y: 64, z: 0 },
		startRotation: 350,
		endRotation: 5,
		readBlock: () => {
			reads++;
			return { typeId: "minecraft:air" };
		}
	}), undefined);
	assert.ok(reads < 40, "short rotations should not scan a nearly full revolution");
});
