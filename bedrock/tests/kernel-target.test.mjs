import assert from "node:assert/strict";
import test from "node:test";

import { KERNEL_DEFAULT_TASK_BUDGET, KERNEL_MAX_TASKS_PER_TICK } from "../behavior_pack/scripts/kernel/kernel-target.js";

test("S3-15 exposes positive production kernel budgets for acceptance baselines", () => {
	assert.equal(KERNEL_DEFAULT_TASK_BUDGET, 32);
	assert.equal(KERNEL_MAX_TASKS_PER_TICK, 64);
	assert.ok(KERNEL_MAX_TASKS_PER_TICK >= KERNEL_DEFAULT_TASK_BUDGET);
});
