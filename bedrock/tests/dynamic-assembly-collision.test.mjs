import assert from "node:assert/strict";
import test from "node:test";

import { ASSEMBLY_SUBBLOCK_UNITS, createAssemblyTransform } from "../behavior_pack/scripts/contraptions/assembly-transform.js";
import { findDynamicAssemblyCollision } from "../behavior_pack/scripts/contraptions/dynamic-assembly-collision.js";
import { createDynamicAssemblySnapshot } from "../behavior_pack/scripts/contraptions/dynamic-assembly-snapshot.js";

function snapshot() {
	return createDynamicAssemblySnapshot({
		anchor: { x: 0, y: 64, z: 0 },
		blocks: [
			{ location: { x: 0, y: 64, z: 0 }, typeId: "createbedrock:shaft" },
			{ location: { x: 1, y: 64, z: 0 }, typeId: "createbedrock:cogwheel" }
		]
	});
}

test("dynamic assembly collision conservatively sweeps both translation and rotation", () => {
	const translationCollision = findDynamicAssemblyCollision({
		endTransform: createAssemblyTransform({ translation: { x: ASSEMBLY_SUBBLOCK_UNITS, y: 0, z: 0 } }),
		readBlock: location => location.x === 2 && location.y === 64 && location.z === 0 ? { typeId: "minecraft:stone" } : { typeId: "minecraft:air" },
		snapshot: snapshot(),
		startTransform: createAssemblyTransform()
	});
	assert.deepEqual(translationCollision?.location, { x: 2, y: 64, z: 0 });

	const rotationCollision = findDynamicAssemblyCollision({
		endTransform: createAssemblyTransform({ rotationMilliDegrees: 90000 }),
		readBlock: location => location.x === 0 && location.y === 64 && location.z === 1 ? { typeId: "minecraft:stone" } : { typeId: "minecraft:air" },
		snapshot: snapshot(),
		startTransform: createAssemblyTransform()
	});
	assert.deepEqual(rotationCollision?.location, { x: 0, y: 64, z: 1 });
});
