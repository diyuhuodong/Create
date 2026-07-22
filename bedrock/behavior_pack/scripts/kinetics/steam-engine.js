import { BURNER_HEAT_LEVEL, HEAT_REQUIREMENT, isHeatSatisfied } from "../fluids/heat-level.js";
import { boilerEngineEfficiency } from "./boiler-model.js";

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

/** P7.4C output path: BoilerData decides heat and per-engine efficiency before
 * this adapter projects the resulting source into KineticWorld. */
export function boilerSteamEngineOutput(contents, boiler) {
	if (!contents || contents.typeId !== "minecraft:water" || contents.amount < STEAM_ENGINE_CONSUMPTION_PER_TICK)
		return { capacity: 0, consume: 0, speed: 0 };
	const { efficiency, heatLevel } = boilerEngineEfficiency(boiler);
	if (efficiency <= 0 || heatLevel <= 0)
		return { capacity: 0, consume: 0, speed: 0 };
	return {
		capacity: Math.max(1, Math.floor(64 * heatLevel * efficiency)),
		consume: STEAM_ENGINE_CONSUMPTION_PER_TICK,
		speed: Math.max(1, Math.floor(16 * heatLevel * efficiency))
	};
}
