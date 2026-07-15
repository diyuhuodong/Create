import assert from "node:assert/strict";
import test from "node:test";

import { LINKED_CONTROLLER_ITEM_STATE_PROPERTY, configureLinkedControllerChannel, configureLinkedControllerChannels, createLinkedControllerItemState, readLinkedControllerItemState, writeLinkedControllerItemState } from "../behavior_pack/scripts/redstone/linked-controller-item-state.js";

function itemStack() {
	const properties = new Map();
	return {
		typeId: "createbedrock:linked_controller",
		getDynamicProperty(key) { return properties.get(key); },
		setDynamicProperty(key, value) { properties.set(key, value); }
	};
}

test("a newly crafted controller gets durable per-item six-channel state", () => {
	const item = itemStack();
	const initial = readLinkedControllerItemState(item);
	assert.equal(initial.revision, 0);
	assert.equal(initial.channels.length, 6);
	const edited = configureLinkedControllerChannel({
		channel: 4,
		expectedRevision: initial.revision,
		frequency: ["minecraft:bricks", "minecraft:gold_block"],
		state: initial
	});
	writeLinkedControllerItemState(item, edited.state);
	assert.deepEqual(readLinkedControllerItemState(item).channels[4], ["minecraft:bricks", "minecraft:gold_block"]);
	assert.equal(typeof item.getDynamicProperty(LINKED_CONTROLLER_ITEM_STATE_PROPERTY), "string");
});

test("controller edits reject stale menus and retain independent item configurations", () => {
	const initial = createLinkedControllerItemState();
	const current = configureLinkedControllerChannel({
		channel: 0,
		expectedRevision: 0,
		frequency: ["minecraft:red_wool", "minecraft:blue_wool"],
		state: initial
	});
	const stale = configureLinkedControllerChannels({
		expectedRevision: 0,
		frequencies: current.state.channels,
		state: current.state
	});
	assert.equal(stale.conflict, true);
	assert.equal(stale.state.revision, 1);
});
