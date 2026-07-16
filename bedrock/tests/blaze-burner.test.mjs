import assert from "node:assert/strict";
import test from "node:test";

import {
	BURNER_FUEL,
	BURNER_HEAT,
	fuelForItem,
	heatForFuel,
	insertBurnerFuel,
	MAX_HEAT_CAPACITY,
	SPECIAL_COOLDOWN_DURATION,
	tickBurnerFuel
} from "../behavior_pack/scripts/materials/blaze-burner.js";

test("blaze cake starts special heat and falls back to Create's normal heat tail", () => {
	const cake = fuelForItem("createbedrock:blaze_cake");
	assert.deepEqual(cake, { fuel: BURNER_FUEL.SPECIAL, remaining: 3200 });
	assert.equal(heatForFuel(cake), BURNER_HEAT.SEETHING);
	assert.deepEqual(tickBurnerFuel({ fuel: BURNER_FUEL.SPECIAL, remaining: 1 }), {
		fuel: BURNER_FUEL.NORMAL,
		remaining: SPECIAL_COOLDOWN_DURATION
	});
});

test("normal fuel follows insertion threshold and Java's overflow cap", () => {
	const coal = fuelForItem("minecraft:coal");
	assert.equal(insertBurnerFuel({ fuel: BURNER_FUEL.NORMAL, remaining: 501 }, coal).accepted, true);
	assert.equal(insertBurnerFuel({ fuel: BURNER_FUEL.SPECIAL, remaining: 100 }, coal).accepted, false);
	const capped = insertBurnerFuel({ fuel: BURNER_FUEL.NORMAL, remaining: 9999 }, coal);
	assert.equal(capped.record.remaining, MAX_HEAT_CAPACITY);
	assert.equal(heatForFuel({ fuel: BURNER_FUEL.NORMAL, remaining: 100 }), BURNER_HEAT.FADING);
	assert.equal(tickBurnerFuel({ fuel: BURNER_FUEL.NORMAL, remaining: 1 }), undefined);
});

test("creative blaze cake remains permanently seething and rejects replacement", () => {
	const creative = fuelForItem("createbedrock:creative_blaze_cake");
	assert.equal(creative.fuel, BURNER_FUEL.CREATIVE);
	assert.deepEqual(tickBurnerFuel(creative), creative);
	assert.equal(insertBurnerFuel(creative, fuelForItem("createbedrock:blaze_cake")).accepted, false);
});
