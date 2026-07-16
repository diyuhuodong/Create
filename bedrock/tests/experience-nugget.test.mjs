import assert from "node:assert/strict";
import test from "node:test";

import { EXPERIENCE_PER_NUGGET, experienceNuggetUsePlan } from "../behavior_pack/scripts/materials/experience-nugget.js";

test("experience nuggets redeem one while sneaking and otherwise redeem the held stack", () => {
	assert.deepEqual(experienceNuggetUsePlan({ count: 4, isSneaking: true }), {
		consumed: 1,
		experience: EXPERIENCE_PER_NUGGET,
		remaining: 3
	});
	assert.deepEqual(experienceNuggetUsePlan({ count: 4 }), {
		consumed: 4,
		experience: EXPERIENCE_PER_NUGGET * 4,
		remaining: 0
	});
	assert.throws(() => experienceNuggetUsePlan({ count: 0 }), /1 through 64/);
});
