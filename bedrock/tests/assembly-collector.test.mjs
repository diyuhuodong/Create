import assert from "node:assert/strict";
import test from "node:test";

import { collectConnectedBlocks } from "../behavior_pack/scripts/contraptions/assembly-collector.js";

function worldWith(...locations) {
	const blocks = new Map(locations.map(location => [`${location.x}:${location.y}:${location.z}`, { typeId: "minecraft:stone" }]));
	return location => blocks.get(`${location.x}:${location.y}:${location.z}`);
}

test("collectConnectedBlocks returns one face-connected assembly", () => {
	const blocks = collectConnectedBlocks({
		start: { x: 0, y: 0, z: 0 },
		readBlock: worldWith({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 })
	});
	assert.equal(blocks.length, 3);
});

test("collectConnectedBlocks enforces a bounded prototype size", () => {
	assert.throws(() => collectConnectedBlocks({
		start: { x: 0, y: 0, z: 0 },
		maxBlocks: 1,
		readBlock: worldWith({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })
	}), /exceeds/);
	assert.throws(() => collectConnectedBlocks({
		start: { x: 0, y: 0, z: 0 },
		maxBlocks: 17,
		readBlock: worldWith({ x: 0, y: 0, z: 0 })
	}), /between one and 16/);
});
