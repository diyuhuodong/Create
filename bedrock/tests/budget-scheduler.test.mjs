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
		kinetics: { budget: 1, completed: 1, failed: 0, merged: 0, pending: 1 },
		trains: { budget: 2, completed: 2, failed: 0, merged: 0, pending: 1 }
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
	assert.throws(() => scheduler.enqueueUnique("valid", "", () => {}), TypeError);
	assert.throws(() => scheduler.enqueueUnique("valid", "task", "bad"), TypeError);
});

test("BudgetScheduler coalesces keyed work while retaining FIFO execution", () => {
	const scheduler = new BudgetScheduler();
	scheduler.registerGroup("work", 2);
	const order = [];
	assert.equal(scheduler.enqueueUnique("work", "train:a", () => order.push("a")), true);
	assert.equal(scheduler.enqueueUnique("work", "train:a", () => order.push("duplicate")), false);
	scheduler.enqueue("work", () => order.push("plain"));
	assert.equal(scheduler.enqueueUnique("work", "train:b", () => order.push("b")), true);

	assert.deepEqual(scheduler.tick().work, { completed: 2, failed: 0, pending: 1 });
	assert.deepEqual(order, ["a", "plain"]);
	assert.equal(scheduler.enqueueUnique("work", "train:a", () => order.push("a-again")), true);
	assert.deepEqual(scheduler.diagnostics().work, {
		budget: 2,
		completed: 2,
		failed: 0,
		merged: 1,
		pending: 2
	});
	assert.deepEqual(scheduler.tick().work, { completed: 2, failed: 0, pending: 0 });
	assert.deepEqual(order, ["a", "plain", "b", "a-again"]);
});

test("BudgetScheduler applies a rotating global cap without starving later groups", () => {
	const scheduler = new BudgetScheduler({ maxTasksPerTick: 2 });
	scheduler.registerGroup("alpha", 2);
	scheduler.registerGroup("beta", 2);
	const completed = [];
	for (const value of ["a1", "a2"])
		scheduler.enqueue("alpha", () => completed.push(value));
	for (const value of ["b1", "b2"])
		scheduler.enqueue("beta", () => completed.push(value));

	assert.deepEqual(scheduler.tick(), {
		alpha: { completed: 2, failed: 0, pending: 0 },
		beta: { completed: 0, failed: 0, pending: 2 }
	});
	assert.deepEqual(scheduler.performanceDiagnostics(), { deferred: 2, executed: 2, maxTasksPerTick: 2 });
	assert.deepEqual(scheduler.tick(), {
		alpha: { completed: 0, failed: 0, pending: 0 },
		beta: { completed: 2, failed: 0, pending: 0 }
	});
	assert.deepEqual(completed, ["a1", "a2", "b1", "b2"]);
});
