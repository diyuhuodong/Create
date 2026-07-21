import { BURNER_HEAT_LEVEL, HEAT_REQUIREMENT, isHeatSatisfied } from "../fluids/heat-level.js";

export const STEAM_ENGINE_CONSUMPTION_PER_TICK = 50;

/**
 * Converts water plus the shared Burner/Boiler heat interface into a bounded
 * powered-shaft output. Heat belongs to the heater, never to mutable water
 * tags, so tank transfers and restart recovery cannot manufacture a heated
 * fluid identity.
 */
export function steamEngineOutput(contents, { heatLevel = BURNER_HEAT_LEVEL.NONE } = {}) {
	if (!contents || contents.typeId !== "minecraft:water" || contents.amount < STEAM_ENGINE_CONSUMPTION_PER_TICK)
		return { capacity: 0, consume: 0, speed: 0 };
	if (!isHeatSatisfied(heatLevel, HEAT_REQUIREMENT.HEATED))
		return { capacity: 0, consume: 0, speed: 0 };
	const tier = isHeatSatisfied(heatLevel, HEAT_REQUIREMENT.SUPERHEATED) ? 2 : 1;
	return {
		capacity: 64 * tier,
		consume: STEAM_ENGINE_CONSUMPTION_PER_TICK,
		speed: 16 * tier
	};
}
