import assert from "node:assert/strict";
import test from "node:test";

import { nozzleFanLocation, nozzleImpulse, nozzleRangeForSpeed } from "../behavior_pack/scripts/materials/nozzle.js";

test("Nozzle scales the Java 3-to-20 block air range with fan speed", () => {
	assert.equal(nozzleRangeForSpeed(0), 0);
	assert.equal(nozzleRangeForSpeed(256), 20);
	assert.equal(nozzleRangeForSpeed(-128), 11.5);
	assert.deepEqual(nozzleFanLocation({ x: 3, y: 64, z: -2 }, 5), { x: 2, y: 64, z: -2 });
});

test("Nozzle applies outward pushes and inward pulls, with gentler item impulses", () => {
	assert.deepEqual(nozzleImpulse({ distance: 4, entityTypeId: "minecraft:zombie", pushing: true, range: 20, vector: { x: 4, y: 0, z: 0 } }), { x: 0.5, y: 0, z: 0 });
	assert.deepEqual(nozzleImpulse({ distance: 4, entityTypeId: "minecraft:item", pushing: false, range: 20, vector: { x: 0, y: 4, z: 0 } }), { x: 0, y: -0.125, z: 0 });
	assert.equal(nozzleImpulse({ distance: 1, entityTypeId: "minecraft:zombie", pushing: false, range: 20, vector: { x: 1, y: 0, z: 0 } }), undefined);
});
