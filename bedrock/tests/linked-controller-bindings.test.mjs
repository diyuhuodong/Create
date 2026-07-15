import assert from "node:assert/strict";
import test from "node:test";

import { LINKED_CONTROLLER_CHANNELS, linkedControllerChannelForSlot, normalizeLinkedControllerBindings, setLinkedControllerChannel } from "../behavior_pack/scripts/redstone/linked-controller-bindings.js";

test("Linked Controller migrates a legacy pair into its first of six persistent channels", () => {
	const bindings = normalizeLinkedControllerBindings(["minecraft:red_wool", "minecraft:blue_wool"]);
	assert.equal(bindings.length, LINKED_CONTROLLER_CHANNELS);
	assert.deepEqual(bindings[0], ["minecraft:red_wool", "minecraft:blue_wool"]);
	assert.deepEqual(bindings.at(-1), ["minecraft:air", "minecraft:air"]);
});

test("Linked Controller uses the selected hotbar slot to select an independent frequency channel", () => {
	assert.equal(linkedControllerChannelForSlot(0), 0);
	assert.equal(linkedControllerChannelForSlot(5), 5);
	assert.equal(linkedControllerChannelForSlot(8), 2);
	const bindings = setLinkedControllerChannel(undefined, linkedControllerChannelForSlot(8), ["minecraft:brass_block", "minecraft:zinc_block"]);
	assert.deepEqual(bindings[2], ["minecraft:brass_block", "minecraft:zinc_block"]);
	assert.deepEqual(bindings[0], ["minecraft:air", "minecraft:air"]);
});
