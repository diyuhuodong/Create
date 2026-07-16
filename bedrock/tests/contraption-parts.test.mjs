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
	for (const typeId of [
		"createbedrock:stockpile_switch",
		"createbedrock:speedometer",
		"createbedrock:stressometer",
		"createbedrock:placard",
		"createbedrock:display_board",
		"createbedrock:stock_ticker",
		"createbedrock:cuckoo_clock",
		"createbedrock:mysterious_cuckoo_clock",
		"createbedrock:peculiar_bell",
		"createbedrock:haunted_bell",
		"createbedrock:andesite_door",
		"createbedrock:brass_door",
		"createbedrock:copper_door",
		"createbedrock:framed_glass_door",
		"createbedrock:train_door",
		"createbedrock:steam_whistle",
		"createbedrock:steam_whistle_extension",
		"createbedrock:sail_frame",
		"createbedrock:white_sail"
	]) {
		assert.equal(isMovableBlockType(typeId), true);
		assert.equal(partTypeFor(typeId), "createbedrock:contraption_part");
	}
	assert.equal(isMovableBlockType("createbedrock:nozzle"), true);
	assert.equal(partTypeFor("createbedrock:nozzle"), "createbedrock:contraption_part");
	assert.equal(isMovableBlockType("createbedrock:mechanical_crafter"), true);
	assert.equal(partTypeFor("createbedrock:mechanical_crafter"), "createbedrock:contraption_part");
	for (const typeId of [
		"createbedrock:controls",
		"createbedrock:deployer",
		"createbedrock:mechanical_plough",
		"createbedrock:mechanical_harvester",
		"createbedrock:mechanical_arm",
		"createbedrock:mechanical_roller",
		"createbedrock:mechanical_drill",
		"createbedrock:piston_extension_pole",
		"createbedrock:portable_storage_interface"
	]) {
		assert.equal(isMovableBlockType(typeId), true);
		assert.equal(partTypeFor(typeId), "createbedrock:contraption_part");
	}
	for (const typeId of ["createbedrock:linear_chassis", "createbedrock:secondary_linear_chassis", "createbedrock:radial_chassis"]) {
		assert.equal(isMovableBlockType(typeId), true);
		assert.equal(partTypeFor(typeId), "createbedrock:contraption_part");
	}
	for (const typeId of ["createbedrock:copycat_panel", "createbedrock:copycat_step"]) {
		assert.equal(isMovableBlockType(typeId), true);
		assert.equal(partTypeFor(typeId), "createbedrock:contraption_part");
	}
	for (const typeId of [
		"createbedrock:mechanical_piston",
		"createbedrock:sticky_mechanical_piston",
		"createbedrock:mechanical_piston_head",
		"createbedrock:rope_pulley",
		"createbedrock:hose_pulley",
		"createbedrock:rope",
		"createbedrock:pulley_magnet",
		"createbedrock:sticker",
		"createbedrock:gantry_carriage",
		"createbedrock:gantry_shaft"
	]) {
		assert.equal(isMovableBlockType(typeId), true);
		assert.equal(partTypeFor(typeId), "createbedrock:contraption_part");
	}
	assert.equal(MOVABLE_BLOCK_TYPES.size, 84);
	assert.deepEqual([...STATELESS_MOVABLE_BLOCK_TYPES].sort(), [
		"createbedrock:andesite_casing",
		"createbedrock:brass_casing",
		"createbedrock:copper_casing",
		"createbedrock:industrial_iron_block",
		"createbedrock:linear_chassis",
		"createbedrock:mechanical_drill",
		"createbedrock:mechanical_piston_head",
		"createbedrock:pulley_magnet",
		"createbedrock:radial_chassis",
		"createbedrock:rope",
		"createbedrock:sail_frame",
		"createbedrock:secondary_linear_chassis",
		"createbedrock:steam_whistle_extension",
		"createbedrock:white_sail",
		"createbedrock:zinc_block"
	]);
});
