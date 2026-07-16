import assert from "node:assert/strict";
import test from "node:test";

import { BOUND_CARDBOARD_BLOCK, boundCardboardDrops, hasSilkTouch } from "../behavior_pack/scripts/materials/bound-cardboard.js";

test("bound cardboard distinguishes silk-touch and normal drops", () => {
	assert.deepEqual(boundCardboardDrops({ silkTouch: true }), [BOUND_CARDBOARD_BLOCK]);
	assert.deepEqual(boundCardboardDrops(), ["minecraft:string", "createbedrock:cardboard_block"]);
});

test("bound cardboard recognizes Silk Touch from Bedrock's enchantable item component", () => {
	assert.equal(hasSilkTouch({ getComponent: () => ({ hasEnchantment: id => id === "minecraft:silk_touch" }) }), true);
	assert.equal(hasSilkTouch({ getComponent: () => ({ hasEnchantment: id => id === "silk_touch" }) }), true);
	assert.equal(hasSilkTouch({ getComponent: () => ({ hasEnchantment: () => false }) }), false);
	assert.equal(hasSilkTouch(), false);
});
