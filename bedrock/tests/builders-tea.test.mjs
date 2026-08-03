import assert from "node:assert/strict";
import test from "node:test";

import { BUILDERS_TEA_HASTE_TICKS, buildersTeaEffectPlan } from "../behavior_pack/scripts/materials/builders-tea.js";

test("Builder's Tea grants its Java-equivalent haste through the supported script API", () => {
	assert.deepEqual(buildersTeaEffectPlan({ typeId: "createbedrock:builders_tea" }), {
		effect: "haste",
		duration: BUILDERS_TEA_HASTE_TICKS,
		options: { amplifier: 0, showParticles: false }
	});
	assert.equal(BUILDERS_TEA_HASTE_TICKS, 3600);
	assert.equal(buildersTeaEffectPlan({ typeId: "minecraft:milk_bucket" }), undefined);
});
