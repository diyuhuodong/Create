import assert from "node:assert/strict";
import test from "node:test";

import {
	BELL_RING_DURATION,
	HAUNTED_BELL_BLOCK,
	HAUNTED_BELL_EFFECT_TICKS,
	PECULIAR_BELL_BLOCK,
	bellCanRing,
	bellPowerState,
	bellRingState,
	nextBellTicks,
	shouldHauntPeculiarBell
} from "../behavior_pack/scripts/materials/bell.js";

test("bells ring on powered edges and retain Java's cooldown window", () => {
	assert.equal(bellPowerState(0), 0);
	assert.equal(bellPowerState(15), 1);
	assert.equal(bellCanRing(HAUNTED_BELL_BLOCK, 64), false);
	assert.equal(bellCanRing(HAUNTED_BELL_BLOCK, 65), true);
	assert.deepEqual(bellRingState(HAUNTED_BELL_BLOCK), { ringingTicks: 1, effectTicks: HAUNTED_BELL_EFFECT_TICKS });
	assert.deepEqual(nextBellTicks({ ringingTicks: BELL_RING_DURATION, effectTicks: 1 }), { ringingTicks: 0, effectTicks: 0 });
});

test("peculiar bells become haunted only on soul fire or soul campfires", () => {
	assert.equal(shouldHauntPeculiarBell(PECULIAR_BELL_BLOCK, "minecraft:soul_fire"), true);
	assert.equal(shouldHauntPeculiarBell(PECULIAR_BELL_BLOCK, "minecraft:soul_campfire"), true);
	assert.equal(shouldHauntPeculiarBell(PECULIAR_BELL_BLOCK, "minecraft:campfire"), false);
});
