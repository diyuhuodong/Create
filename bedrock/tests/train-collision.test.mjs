import assert from "node:assert/strict";
import test from "node:test";

import { findTrainCollision, TRAIN_COLLISION_BOX } from "../behavior_pack/scripts/trains/train-collision.js";

test("findTrainCollision checks each carriage's one-block clearance space", () => {
	const collision = findTrainCollision([
		{ location: { x: 0.5, y: 64, z: 0.5 } },
		{ location: { x: 1.25, y: 64.5, z: 0.75 } }
	], location => location.x === 1 ? { typeId: "minecraft:stone" } : { typeId: "minecraft:air" });
	assert.deepEqual(TRAIN_COLLISION_BOX, { height: 1, width: 1 });
	assert.deepEqual(collision, {
		location: { x: 1, y: 65, z: 0 },
		reason: "world_blocked"
	});
});

test("findTrainCollision ignores air and rejects invalid inputs", () => {
	assert.equal(findTrainCollision([{ location: { x: 0, y: 64, z: 0 } }], () => ({ typeId: "minecraft:air" })), undefined);
	assert.throws(() => findTrainCollision([], undefined), /readBlock/);
});
