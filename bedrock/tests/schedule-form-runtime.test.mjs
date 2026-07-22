import assert from "node:assert/strict";
import test from "node:test";

import { openScheduleFormSession, submitScheduleFormIntent } from "../behavior_pack/scripts/trains/schedule-form-runtime.js";
import { createScheduleItemState } from "../behavior_pack/scripts/trains/schedule-item-state.js";

const destination = filter => ({
	conditionBranches: [[{ ticks: 20, type: "delay" }]],
	instruction: { exact: true, filter, type: "destination" }
});

test("Schedule form intents apply validated AST edits through revision CAS", () => {
	const initial = createScheduleItemState({ stopIds: ["a"] });
	const session = openScheduleFormSession(initial, "schedule:item:one");
	const updated = submitScheduleFormIntent({ currentState: initial, intent: { entry: destination("b"), type: "append_entry" }, session });
	assert.equal(updated.changed, true);
	assert.equal(updated.conflict, false);
	assert.deepEqual(updated.state.stopIds, ["a", "b"]);
	assert.equal(updated.state.revision, 1);
	assert.throws(() => submitScheduleFormIntent({ currentState: updated.state, intent: { entries: [{ nope: true }], type: "replace_schedule" }, session: openScheduleFormSession(updated.state, "schedule:item:one") }), /Schedule entries/);
});

test("Schedule form rejects the second editor instead of overwriting the first", () => {
	const initial = createScheduleItemState({ stopIds: ["a"] });
	const left = openScheduleFormSession(initial, "schedule:item:shared");
	const right = openScheduleFormSession(initial, "schedule:item:shared");
	const committed = submitScheduleFormIntent({ currentState: initial, intent: { entry: destination("b"), type: "append_entry" }, session: left }).state;
	assert.deepEqual(submitScheduleFormIntent({ currentState: committed, intent: { entry: destination("c"), type: "append_entry" }, session: right }), {
		changed: false,
		conflict: true
	});
});
