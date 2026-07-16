import assert from "node:assert/strict";
import test from "node:test";

import {
	CLOCK_ANIMATION,
	CUCKOO_SURPRISE_TICK,
	cuckooClockAnimation,
	cuckooClockHand,
	cuckooClockTime,
	nextCuckooAnimation
} from "../behavior_pack/scripts/materials/cuckoo-clock.js";

test("cuckoo clock follows Java's overworld time and show windows", () => {
	assert.deepEqual(cuckooClockTime(6000), { hours: 12, minutes: 0 });
	assert.deepEqual(cuckooClockHand(18, 34), { hour: 6, minute: 6 });
	assert.equal(cuckooClockAnimation({ hours: 12, minutes: 4 }), CLOCK_ANIMATION.PIG);
	assert.equal(cuckooClockAnimation({ hours: 18, minutes: 32 }), CLOCK_ANIMATION.CREEPER);
	assert.equal(cuckooClockAnimation({ hours: 12, minutes: 0, mysterious: true }), CLOCK_ANIMATION.SURPRISE);
	assert.equal(cuckooClockAnimation({ hours: 12, minutes: 0, naturalDimension: false }), CLOCK_ANIMATION.NONE);
});

test("mysterious cuckoo clock explodes exactly at its Java surprise tick", () => {
	const before = nextCuckooAnimation({ animation: CLOCK_ANIMATION.SURPRISE, progress: CUCKOO_SURPRISE_TICK - 1 });
	assert.equal(before.surprise, true);
	const after = nextCuckooAnimation({ animation: CLOCK_ANIMATION.SURPRISE, progress: 101 });
	assert.equal(after.animation, CLOCK_ANIMATION.NONE);
	assert.equal(after.finished, true);
});
