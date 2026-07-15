import assert from "node:assert/strict";
import test from "node:test";

import { partTypeFor } from "../behavior_pack/scripts/contraptions/contraption-parts.js";
import { isMovableBlockType, MAX_CONTRAPTION_BLOCKS, MOVABLE_BLOCK_TYPES, STATELESS_MOVABLE_BLOCK_TYPES } from "../behavior_pack/scripts/contraptions/movable-blocks.js";

test("Contraption part registry covers kinetic blocks and uses the generic projection for newly movable redstone devices", () => {
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
	assert.equal(isMovableBlockType("createbedrock:redstone_contact"), true);
	assert.equal(partTypeFor("createbedrock:redstone_contact"), "createbedrock:contraption_part");
	assert.equal(isMovableBlockType("createbedrock:elevator_contact"), true);
	assert.equal(partTypeFor("createbedrock:elevator_contact"), "createbedrock:contraption_part");
	assert.equal(isMovableBlockType("createbedrock:belt"), true);
	assert.equal(partTypeFor("createbedrock:belt"), "createbedrock:contraption_part");
	assert.equal(MOVABLE_BLOCK_TYPES.size, 38);
	assert.deepEqual([...STATELESS_MOVABLE_BLOCK_TYPES].sort(), [
		"createbedrock:andesite_casing",
		"createbedrock:brass_casing",
		"createbedrock:copper_casing",
		"createbedrock:industrial_iron_block",
		"createbedrock:zinc_block"
	]);
});
