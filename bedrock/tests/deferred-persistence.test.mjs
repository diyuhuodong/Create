import assert from "node:assert/strict";
import test from "node:test";

import { DeferredPersistence } from "../behavior_pack/scripts/kernel/deferred-persistence.js";

test("DeferredPersistence coalesces dirty writes until its configured interval", () => {
	let writes = 0;
	const persistence = new DeferredPersistence({
		intervalTicks: 3,
		name: "test",
		write() {
			writes++;
		}
	});

	persistence.request();
	persistence.request();
	assert.equal(persistence.tick(), false);
	assert.equal(persistence.tick(), false);
	assert.equal(persistence.tick(), true);
	assert.equal(writes, 1);
	assert.deepEqual(persistence.diagnostics(), {
		dirty: false,
		failures: 0,
		lastError: undefined,
		name: "test",
		ticksUntilWrite: undefined,
		writes: 1
	});
});

test("DeferredPersistence retains dirty state and retries after a failed write", () => {
	let attempts = 0;
	const errors = [];
	const persistence = new DeferredPersistence({
		intervalTicks: 2,
		name: "retry",
		onError(error, name) {
			errors.push([String(error), name]);
		},
		write() {
			attempts++;
			if (attempts === 1)
				throw new Error("storage unavailable");
		}
	});

	persistence.request();
	persistence.tick();
	assert.equal(persistence.tick(), false);
	assert.deepEqual(errors, [["Error: storage unavailable", "retry"]]);
	assert.equal(persistence.diagnostics().dirty, true);
	assert.equal(persistence.diagnostics().failures, 1);
	persistence.tick();
	assert.equal(persistence.tick(), true);
	assert.equal(attempts, 2);
	assert.equal(persistence.diagnostics().dirty, false);
});

test("DeferredPersistence rejects invalid construction arguments", () => {
	assert.throws(() => new DeferredPersistence({ name: "bad", write() {}, intervalTicks: 0 }), RangeError);
	assert.throws(() => new DeferredPersistence({ name: "", write() {} }), TypeError);
	assert.throws(() => new DeferredPersistence({ name: "bad" }), TypeError);
});
