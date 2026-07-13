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
	"createbedrock:crushing_wheel"
]);

export function isMovableBlockType(typeId) {
	return MOVABLE_BLOCK_TYPES.has(typeId);
}
