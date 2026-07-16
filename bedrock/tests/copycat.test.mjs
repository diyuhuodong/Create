import assert from "node:assert/strict";
import test from "node:test";

import { COPYCAT_EMPTY_MATERIAL, applyCopycatMaterial, clearCopycatMaterial, copycatHasMaterial, createCopycatState } from "../behavior_pack/scripts/materials/copycat.js";

test("Copycat accepts one material, rotates a repeated material, and requires reset before replacement", () => {
	const empty = createCopycatState();
	const applied = applyCopycatMaterial(empty, "minecraft:stone");
	assert.equal(applied.changed, true);
	assert.equal(applied.consumed, true);
	assert.equal(copycatHasMaterial(applied.state), true);

	const rotated = applyCopycatMaterial(applied.state, "minecraft:stone");
	assert.equal(rotated.changed, true);
	assert.equal(rotated.consumed, false);
	assert.equal(rotated.state.rotation, 1);

	const occupied = applyCopycatMaterial(rotated.state, "minecraft:oak_planks");
	assert.equal(occupied.changed, false);
	assert.equal(occupied.reason, "occupied");
});

test("Copycat reset returns the consumed material and restores an empty state", () => {
	const state = createCopycatState({ materialItemType: "createbedrock:brass_casing", rotation: 3 });
	const cleared = clearCopycatMaterial(state);
	assert.equal(cleared.changed, true);
	assert.equal(cleared.materialItemType, "createbedrock:brass_casing");
	assert.equal(cleared.state.materialItemType, COPYCAT_EMPTY_MATERIAL);
	assert.equal(cleared.state.rotation, 0);
});
