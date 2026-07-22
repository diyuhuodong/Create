import assert from "node:assert/strict";
import test from "node:test";

import { appendScheduleStop, createScheduleItemState, MAX_SCHEDULE_STOPS, readScheduleItemState, SCHEDULE_ITEM, SCHEDULE_ITEM_STATE_PROPERTY, toggleScheduleCycle, updateScheduleItemState, writeScheduleItemState } from "../behavior_pack/scripts/trains/schedule-item-state.js";

function item() {
	const properties = new Map();
	return { getDynamicProperty: key => properties.get(key), properties, setDynamicProperty: (key, value) => properties.set(key, value), typeId: SCHEDULE_ITEM };
}

test("Schedule Item state is bounded, revisioned, and stored on its non-stackable item", () => {
	const stack = item();
	const initial = createScheduleItemState();
	const appended = appendScheduleStop(initial, "station:one");
	writeScheduleItemState(stack, appended.state);
	assert.deepEqual(readScheduleItemState(stack).stopIds, ["station:one"]);
	assert.equal(toggleScheduleCycle(appended.state).cyclic, false);
	assert.equal(appended.state.schedule.schemaVersion, 2);
});

test("Schedule Item state rejects duplicate and overlong stop lists", () => {
	assert.throws(() => createScheduleItemState({ stopIds: ["a", "a"] }), /duplicate/);
	assert.throws(() => createScheduleItemState({ stopIds: Array.from({ length: MAX_SCHEDULE_STOPS + 1 }, (_, index) => `node:${index}`) }), /at most/);
});

test("Schedule Item upgrades schema-1 data and rejects stale AST edits", () => {
	const stack = item();
	stack.properties.set(SCHEDULE_ITEM_STATE_PROPERTY, JSON.stringify({ cyclic: true, dwellTicks: 10, revision: 3, schemaVersion: 1, stopIds: ["legacy"] }));
	const migrated = readScheduleItemState(stack);
	assert.equal(migrated.schemaVersion, 2);
	assert.equal(migrated.schedule.revision, 3);
	assert.deepEqual(updateScheduleItemState(migrated, 2, schedule => schedule), { changed: false, reason: "revision_conflict", state: migrated });
});
