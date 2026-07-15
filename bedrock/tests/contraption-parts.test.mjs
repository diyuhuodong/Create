import assert from "node:assert/strict";
import test from "node:test";

import { partTypeFor } from "../behavior_pack/scripts/contraptions/contraption-parts.js";
import { isMovableBlockType, MAX_CONTRAPTION_BLOCKS, MOVABLE_BLOCK_TYPES, STATELESS_MOVABLE_BLOCK_TYPES } from "../behavior_pack/scripts/contraptions/movable-blocks.js";

test("Contraption part registry covers the currently movable kinetic blocks", () => {
	assert.equal(MAX_CONTRAPTION_BLOCKS, 16);
	for (const typeId of [
		"createbedrock:hand_crank",
		"createbedrock:shaft",
		"createbedrock:cogwheel",
		"createbedrock:large_cogwheel",
		"createbedrock:gearbox",
		"createbedrock:clutch",
		"createbedrock:encased_chain_drive",
		"createbedrock:water_wheel",
		"createbedrock:millstone",
		"createbedrock:mechanical_press",
		"createbedrock:crushing_wheel",
		"createbedrock:crushing_wheel_controller",
		"createbedrock:andesite_casing",
		"createbedrock:brass_casing",
		"createbedrock:copper_casing",
		"createbedrock:industrial_iron_block",
		"createbedrock:zinc_block"
	]) {
		assert.equal(isMovableBlockType(typeId), true);
		assert.match(partTypeFor(typeId), /^createbedrock:contraption_part_/);
	}
	assert.equal(isMovableBlockType("createbedrock:track"), false);
	assert.equal(partTypeFor("createbedrock:track"), undefined);
	assert.equal(MOVABLE_BLOCK_TYPES.size, 17);
	assert.deepEqual([...STATELESS_MOVABLE_BLOCK_TYPES].sort(), [
		"createbedrock:andesite_casing",
		"createbedrock:brass_casing",
		"createbedrock:copper_casing",
		"createbedrock:industrial_iron_block",
		"createbedrock:zinc_block"
	]);
});
