import assert from "node:assert/strict";
import test from "node:test";

import { TaskQueue } from "../behavior_pack/scripts/kernel/task-queue.js";

test("TaskQueue preserves FIFO order and respects its drain budget", () => {
	const queue = new TaskQueue();
	const completed = [];

	queue.enqueue(() => completed.push("first"));
	queue.enqueue(() => completed.push("second"));
	queue.enqueue(() => completed.push("third"));

	assert.equal(queue.drain(2), 2);
	assert.deepEqual(completed, ["first", "second"]);
	assert.equal(queue.size, 1);
	assert.equal(queue.drain(2), 1);
	assert.deepEqual(completed, ["first", "second", "third"]);
});

test("TaskQueue rejects non-function work", () => {
	const queue = new TaskQueue();
	assert.throws(() => queue.enqueue("not a task"), TypeError);
});
