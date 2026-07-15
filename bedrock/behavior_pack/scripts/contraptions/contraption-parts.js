import { isMovableBlockType } from "./movable-blocks.js";

const LEGACY_CONTRAPTION_PART = "createbedrock:contraption_part";

export const CONTRAPTION_PART_TYPES = Object.freeze({
	"createbedrock:hand_crank": "createbedrock:contraption_part_hand_crank",
	"createbedrock:shaft": "createbedrock:contraption_part_shaft",
	"createbedrock:cogwheel": "createbedrock:contraption_part_cogwheel",
	"createbedrock:large_cogwheel": "createbedrock:contraption_part_large_cogwheel",
	"createbedrock:gearbox": "createbedrock:contraption_part_gearbox",
	"createbedrock:clutch": "createbedrock:contraption_part_clutch",
	"createbedrock:encased_chain_drive": "createbedrock:contraption_part_encased_chain_drive",
	"createbedrock:water_wheel": "createbedrock:contraption_part_water_wheel",
	"createbedrock:millstone": "createbedrock:contraption_part_millstone",
	"createbedrock:mechanical_press": "createbedrock:contraption_part_mechanical_press",
	"createbedrock:crushing_wheel": "createbedrock:contraption_part_crushing_wheel",
	"createbedrock:crushing_wheel_controller": "createbedrock:contraption_part_crushing_wheel_controller",
	"createbedrock:andesite_casing": "createbedrock:contraption_part_andesite_casing",
	"createbedrock:brass_casing": "createbedrock:contraption_part_brass_casing",
	"createbedrock:copper_casing": "createbedrock:contraption_part_copper_casing",
	"createbedrock:industrial_iron_block": "createbedrock:contraption_part_industrial_iron_block",
	"createbedrock:zinc_block": "createbedrock:contraption_part_zinc_block"
});

export const ALL_CONTRAPTION_PART_TYPES = [LEGACY_CONTRAPTION_PART, ...new Set(Object.values(CONTRAPTION_PART_TYPES))];

export function partTypeFor(blockTypeId) {
	return CONTRAPTION_PART_TYPES[blockTypeId] ?? (isMovableBlockType(blockTypeId) ? LEGACY_CONTRAPTION_PART : undefined);
}
