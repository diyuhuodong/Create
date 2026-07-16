import assert from "node:assert/strict";
import test from "node:test";

import { appendScheduleStop, createScheduleItemState, MAX_SCHEDULE_STOPS, readScheduleItemState, SCHEDULE_ITEM, toggleScheduleCycle, writeScheduleItemState } from "../behavior_pack/scripts/trains/schedule-item-state.js";

function item() {
	const properties = new Map();
	return { getDynamicProperty: key => properties.get(key), setDynamicProperty: (key, value) => properties.set(key, value), typeId: SCHEDULE_ITEM };
}

test("Schedule Item state is bounded, revisioned, and stored on its non-stackable item", () => {
	const stack = item();
	const initial = createScheduleItemState();
	const appended = appendScheduleStop(initial, "station:one");
	writeScheduleItemState(stack, appended.state);
	assert.deepEqual(readScheduleItemState(stack).stopIds, ["station:one"]);
	assert.equal(toggleScheduleCycle(appended.state).cyclic, false);
});

test("Schedule Item state rejects duplicate and overlong stop lists", () => {
	assert.throws(() => createScheduleItemState({ stopIds: ["a", "a"] }), /duplicate/);
	assert.throws(() => createScheduleItemState({ stopIds: Array.from({ length: MAX_SCHEDULE_STOPS + 1 }, (_, index) => `node:${index}`) }), /at most/);
});
