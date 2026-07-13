export const MOVABLE_BLOCK_TYPES = new Set([
	"createbedrock:shaft",
	"createbedrock:cogwheel",
	"createbedrock:large_cogwheel",
	"createbedrock:gearbox",
	"createbedrock:clutch",
	"createbedrock:millstone",
	"createbedrock:mechanical_press",
	"createbedrock:crushing_wheel"
]);

export function isMovableBlockType(typeId) {
	return MOVABLE_BLOCK_TYPES.has(typeId);
}
