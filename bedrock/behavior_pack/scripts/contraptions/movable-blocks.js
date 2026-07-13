export const MAX_CONTRAPTION_BLOCKS = 16;

export const MOVABLE_BLOCK_TYPES = new Set([
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
	"createbedrock:andesite_casing",
	"createbedrock:brass_casing",
	"createbedrock:copper_casing",
	"createbedrock:industrial_iron_block",
	"createbedrock:zinc_block"
]);

// These structural blocks carry no block-entity state.  They still receive a
// no-op data adapter so every whitelisted moving type has an explicit
// capture/detach/restore contract.
export const STATELESS_MOVABLE_BLOCK_TYPES = new Set([
	"createbedrock:andesite_casing",
	"createbedrock:brass_casing",
	"createbedrock:copper_casing",
	"createbedrock:industrial_iron_block",
	"createbedrock:zinc_block"
]);

export function isMovableBlockType(typeId) {
	return MOVABLE_BLOCK_TYPES.has(typeId);
}
