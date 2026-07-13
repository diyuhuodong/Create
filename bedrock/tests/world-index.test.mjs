import assert from "node:assert/strict";
import test from "node:test";

import { WorldIndex, worldLocationKey } from "../behavior_pack/scripts/kernel/world-index.js";

test("WorldIndex isolates equal coordinates by dimension and reports counts", () => {
	const index = new WorldIndex();
	const location = { x: 1, y: 64, z: -2 };
	index.set("minecraft:overworld", location, { type: "shaft" });
	index.set("minecraft:nether", location, { type: "cogwheel" });

	assert.deepEqual(index.get("minecraft:overworld", location), { type: "shaft" });
	assert.deepEqual(index.get("minecraft:nether", location), { type: "cogwheel" });
	assert.deepEqual(index.countsByDimension(), { "minecraft:overworld": 1, "minecraft:nether": 1 });
	assert.equal(index.size, 2);
	assert.equal(worldLocationKey("minecraft:overworld", location), "minecraft:overworld:1:64:-2");
});

test("WorldIndex supports dimension-local enumeration and deletion", () => {
	const index = new WorldIndex();
	index.set("minecraft:overworld", { x: 0, y: 0, z: 0 }, "first");
	index.set("minecraft:overworld", { x: 1, y: 0, z: 0 }, "second");
	index.set("minecraft:nether", { x: 0, y: 0, z: 0 }, "third");

	assert.deepEqual(index.entriesInDimension("minecraft:overworld").map(entry => entry.value), ["first", "second"]);
	assert.equal(index.delete("minecraft:overworld", { x: 0, y: 0, z: 0 }), true);
	assert.equal(index.has("minecraft:overworld", { x: 0, y: 0, z: 0 }), false);
	assert.equal(index.size, 2);
});

test("WorldIndex rejects unstable coordinates", () => {
	const index = new WorldIndex();
	assert.throws(() => index.set("minecraft:overworld", { x: 0.5, y: 0, z: 0 }, "bad"), /integer/);
	assert.throws(() => index.get("", { x: 0, y: 0, z: 0 }), /dimension/);
});
