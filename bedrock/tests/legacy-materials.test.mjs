import assert from "node:assert/strict";
import test from "node:test";

import {
	chromaticLight,
	isCollectableLightSource,
	nextChromaticOutcome,
	REFINED_RADIANCE,
	SHADOW_STEEL
} from "../behavior_pack/scripts/materials/legacy-materials.js";

test("chromatic compound tracks ten light sources and preserves both legacy conversion routes", () => {
	assert.equal(chromaticLight(undefined), 0);
	assert.equal(isCollectableLightSource("minecraft:sea_lantern"), true);
	assert.equal(isCollectableLightSource("minecraft:stone"), false);
	assert.deepEqual(nextChromaticOutcome({ light: 3 }), { kind: "charge", light: 4 });
	assert.deepEqual(nextChromaticOutcome({ light: 9 }), { kind: "convert", output: REFINED_RADIANCE });
	assert.deepEqual(nextChromaticOutcome({ belowWorld: true }), { kind: "convert", output: SHADOW_STEEL });
});
