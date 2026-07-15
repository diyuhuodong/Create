import assert from "node:assert/strict";
import test from "node:test";

import { ASSEMBLY_SUBBLOCK_UNITS, createAssemblyTransform } from "../behavior_pack/scripts/contraptions/assembly-transform.js";
import { createDynamicAssemblySnapshot, materializeDynamicAssembly, normalizeDynamicAssemblySnapshot } from "../behavior_pack/scripts/contraptions/dynamic-assembly-snapshot.js";

test("dynamic assembly snapshots exceed the former sixteen-block prototype and materialize only when aligned", () => {
	const blocks = Array.from({ length: 17 }, (_, x) => ({
		location: { x, y: 64, z: 0 },
		states: { "minecraft:facing_direction": 2 },
		typeId: "createbedrock:andesite_casing"
	}));
	const snapshot = createDynamicAssemblySnapshot({ anchor: { x: 0, y: 64, z: 0 }, blocks });
	assert.equal(snapshot.blocks.length, 17);
	assert.deepEqual(normalizeDynamicAssemblySnapshot(snapshot), snapshot);
	assert.deepEqual(materializeDynamicAssembly(snapshot, createAssemblyTransform({
		rotationMilliDegrees: 90000,
		translation: { x: ASSEMBLY_SUBBLOCK_UNITS, y: 0, z: 0 }
	}))[1].location, { x: 1, y: 64, z: 1 });
	assert.throws(() => materializeDynamicAssembly(snapshot, createAssemblyTransform({
		translation: { x: 1, y: 0, z: 0 }
	})), /block-aligned/);
});
