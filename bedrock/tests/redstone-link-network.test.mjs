import assert from "node:assert/strict";
import test from "node:test";

import { receivedRedstoneLinkPower, redstoneLinkFrequencyKey, redstoneLinksWithinRange } from "../behavior_pack/scripts/redstone/redstone-link-network.js";

test("Redstone Link preserves ordered dual-item frequencies and the configured physical range", () => {
	const frequency = ["minecraft:red_wool", "minecraft:blue_wool"];
	assert.notEqual(redstoneLinkFrequencyKey(frequency), redstoneLinkFrequencyKey([...frequency].reverse()));
	assert.equal(redstoneLinksWithinRange({ x: 0, y: 64, z: 0 }, { x: 256, y: 64, z: 0 }), true);
	assert.equal(redstoneLinksWithinRange({ x: 0, y: 64, z: 0 }, { x: 257, y: 64, z: 0 }), false);
});

test("Redstone Link receivers select the strongest reachable matching analogue transmitter", () => {
	const frequency = ["minecraft:red_wool", "minecraft:blue_wool"];
	const key = redstoneLinkFrequencyKey(frequency);
	assert.equal(receivedRedstoneLinkPower({
		frequency,
		receiver: { x: 0, y: 64, z: 0 },
		transmitters: [
			{ key, location: { x: 4, y: 64, z: 0 }, power: 5 },
			{ key, location: { x: 8, y: 64, z: 0 }, power: 13 },
			{ key: redstoneLinkFrequencyKey(["minecraft:red_wool", "minecraft:lime_wool"]), location: { x: 1, y: 64, z: 0 }, power: 15 },
			{ key, location: { x: 300, y: 64, z: 0 }, power: 15 }
		]
	}), 13);
});
