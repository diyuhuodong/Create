export const DYE_COLORS = Object.freeze([
	"black", "blue", "brown", "cyan", "gray", "green", "light_blue", "light_gray",
	"lime", "magenta", "orange", "pink", "purple", "red", "white", "yellow"
]);

function blocks(suffix, colors = DYE_COLORS) {
	return Object.freeze(colors.map(color => `createbedrock:${color}_${suffix}`));
}

export const COLORED_NIXIE_TUBE_BLOCKS = blocks("nixie_tube", DYE_COLORS.filter(color => color !== "orange"));
export const NIXIE_TUBE_BLOCKS = Object.freeze(["createbedrock:nixie_tube", ...COLORED_NIXIE_TUBE_BLOCKS]);
export const COLORED_POSTBOX_BLOCKS = blocks("postbox");
export const POSTBOX_BLOCKS = Object.freeze(["createbedrock:package_postbox", ...COLORED_POSTBOX_BLOCKS]);
export const COLORED_SAIL_BLOCKS = blocks("sail", DYE_COLORS.filter(color => color !== "white"));
export const WINDMILL_SAIL_BLOCKS = Object.freeze(["createbedrock:sail_frame", "createbedrock:white_sail", ...COLORED_SAIL_BLOCKS]);
export const COLORED_TABLE_CLOTH_BLOCKS = blocks("table_cloth");
export const TABLE_CLOTH_BLOCKS = Object.freeze([
	"createbedrock:andesite_table_cloth", "createbedrock:brass_table_cloth", "createbedrock:copper_table_cloth", ...COLORED_TABLE_CLOTH_BLOCKS
]);
export const COLORED_VALVE_HANDLE_BLOCKS = blocks("valve_handle");
export const VALVE_HANDLE_BLOCKS = Object.freeze(["createbedrock:copper_valve_handle", ...COLORED_VALVE_HANDLE_BLOCKS]);

function set(values) {
	return new Set(values);
}

const NIXIE_TUBE_SET = set(NIXIE_TUBE_BLOCKS);
const POSTBOX_SET = set(POSTBOX_BLOCKS);
const SAIL_SET = set(WINDMILL_SAIL_BLOCKS);
const TABLE_CLOTH_SET = set(TABLE_CLOTH_BLOCKS);
const VALVE_HANDLE_SET = set(VALVE_HANDLE_BLOCKS);

export function isNixieTubeBlock(typeId) { return NIXIE_TUBE_SET.has(typeId); }
export function isPostboxBlock(typeId) { return POSTBOX_SET.has(typeId); }
export function isWindmillSailBlock(typeId) { return SAIL_SET.has(typeId); }
export function isTableClothBlock(typeId) { return TABLE_CLOTH_SET.has(typeId); }
export function isValveHandleBlock(typeId) { return VALVE_HANDLE_SET.has(typeId); }

export function colorForFunctionalBlock(typeId, suffix, fallback) {
	if (typeof typeId !== "string" || typeof suffix !== "string")
		return fallback;
	const match = typeId.match(new RegExp(`^createbedrock:([a-z_]+)_${suffix}$`));
	return match && DYE_COLORS.includes(match[1]) ? match[1] : fallback;
}
