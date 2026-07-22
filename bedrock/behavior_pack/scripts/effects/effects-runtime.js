import { CREATE_SOUND_EVENTS } from "./generated-sound-catalog.js";

export const CREATE_EFFECTS = Object.freeze({
	air: "createbedrock:air",
	airFlow: "createbedrock:air_flow",
	basinFluid: "createbedrock:basin_fluid",
	cube: "createbedrock:cube",
	fluidDrip: "createbedrock:fluid_drip",
	fluidParticle: "createbedrock:fluid_particle",
	rotationIndicator: "createbedrock:rotation_indicator",
	soul: "createbedrock:soul",
	soulBase: "createbedrock:soul_base",
	soulExpandingPerimeter: "createbedrock:soul_expanding_perimeter",
	soulPerimeter: "createbedrock:soul_perimeter",
	steamJet: "createbedrock:steam_jet",
	wifi: "createbedrock:wifi"
});

export function emitCreateEffect(dimension, id, location) {
	if (!Object.values(CREATE_EFFECTS).includes(id) || !dimension?.spawnParticle)
		return false;
	try {
		dimension.spawnParticle(id, location);
		return true;
	} catch {
		return false;
	}
}

export function playCreateSound(dimension, id, location, options) {
	const event = CREATE_SOUND_EVENTS[id];
	if (typeof event !== "string" || !dimension?.playSound)
		return false;
	try {
		dimension.playSound(event, location, options);
		return true;
	} catch {
		return false;
	}
}
