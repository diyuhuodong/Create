export const CHROMATIC_COMPOUND = "createbedrock:chromatic_compound";
export const SHADOW_STEEL = "createbedrock:shadow_steel";
export const REFINED_RADIANCE = "createbedrock:refined_radiance";
export const CHROMATIC_LIGHT_KEY = "createbedrock:chromatic_light";
export const REFINED_RADIANCE_LIGHT_SOURCES = 10;

export const LIGHT_SOURCE_BLOCKS = Object.freeze(new Set([
	"minecraft:beacon", "minecraft:campfire", "minecraft:crying_obsidian", "minecraft:end_rod", "minecraft:fire",
	"minecraft:frogspawn", "minecraft:glowstone", "minecraft:jack_o_lantern", "minecraft:lantern", "minecraft:lava",
	"minecraft:lit_redstone_lamp", "minecraft:magma", "minecraft:ochre_froglight", "minecraft:pearlescent_froglight",
	"minecraft:redstone_torch", "minecraft:respawn_anchor", "minecraft:sea_lantern", "minecraft:shroomlight", "minecraft:soul_campfire",
	"minecraft:soul_fire", "minecraft:soul_lantern", "minecraft:soul_torch", "minecraft:torch", "minecraft:verdant_froglight",
	"minecraft:wall_torch", "minecraft:soul_wall_torch", "minecraft:redstone_wall_torch",
	"createbedrock:blaze_burner", "createbedrock:lit_blaze_burner", "createbedrock:rose_quartz_lamp"
]));

export function chromaticLight(value) {
	if (value === undefined)
		return 0;
	if (!Number.isInteger(value) || value < 0 || value >= REFINED_RADIANCE_LIGHT_SOURCES)
		throw new RangeError(`Chromatic light must be an integer from 0 through ${REFINED_RADIANCE_LIGHT_SOURCES - 1}`);
	return value;
}

export function isChromaticCompound(typeId) {
	return typeId === CHROMATIC_COMPOUND;
}

export function isCollectableLightSource(typeId) {
	return LIGHT_SOURCE_BLOCKS.has(typeId);
}

export function nextChromaticOutcome({ light = 0, inBeaconBeam = false, belowWorld = false } = {}) {
	const collected = chromaticLight(light);
	if (belowWorld)
		return { kind: "convert", output: SHADOW_STEEL };
	if (inBeaconBeam || collected >= REFINED_RADIANCE_LIGHT_SOURCES - 1)
		return { kind: "convert", output: REFINED_RADIANCE };
	return { kind: "charge", light: collected + 1 };
}
