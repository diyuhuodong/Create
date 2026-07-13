import assert from "node:assert/strict";
import test from "node:test";

import { BudgetScheduler } from "../behavior_pack/scripts/kernel/budget-scheduler.js";

test("BudgetScheduler applies an independent task budget to every group", () => {
	const scheduler = new BudgetScheduler();
	scheduler.registerGroup("kinetics", 1);
	scheduler.registerGroup("trains", 2);
	const completed = [];
	for (const value of ["k1", "k2"])
		scheduler.enqueue("kinetics", () => completed.push(value));
	for (const value of ["t1", "t2", "t3"])
		scheduler.enqueue("trains", () => completed.push(value));

	assert.deepEqual(scheduler.tick(), {
		kinetics: { completed: 1, failed: 0, pending: 1 },
		trains: { completed: 2, failed: 0, pending: 1 }
	});
	assert.deepEqual(completed, ["k1", "t1", "t2"]);
	assert.deepEqual(scheduler.diagnostics(), {
		kinetics: { budget: 1, completed: 1, failed: 0, pending: 1 },
		trains: { budget: 2, completed: 2, failed: 0, pending: 1 }
	});
});

test("BudgetScheduler isolates failed tasks and continues draining the group", () => {
	const errors = [];
	const scheduler = new BudgetScheduler({ onError: (name, error) => errors.push(`${name}:${error.message}`) });
	scheduler.registerGroup("restore", 3);
	let completed = 0;
	scheduler.enqueue("restore", () => { throw new Error("corrupt"); });
	scheduler.enqueue("restore", () => completed++);

	assert.deepEqual(scheduler.tick(), { restore: { completed: 1, failed: 1, pending: 0 } });
	assert.equal(completed, 1);
	assert.deepEqual(errors, ["restore:corrupt"]);
});

test("BudgetScheduler rejects invalid groups and tasks", () => {
	const scheduler = new BudgetScheduler();
	assert.throws(() => scheduler.registerGroup("bad", 0), RangeError);
	scheduler.registerGroup("valid", 1);
	assert.equal(scheduler.hasGroup("valid"), true);
	assert.equal(scheduler.hasGroup("missing"), false);
	assert.throws(() => scheduler.registerGroup("valid", 1), /already exists/);
	assert.throws(() => scheduler.enqueue("missing", () => {}), /Unknown/);
	assert.throws(() => scheduler.enqueue("valid", "bad"), TypeError);
});
