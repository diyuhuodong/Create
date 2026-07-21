// These names deliberately mirror Create's HeatCondition: HEATED accepts
// FADING/KINDLED/SEETHING; SUPERHEATED accepts only SEETHING.
export const HEAT_REQUIREMENT = Object.freeze({
	HEATED: "heated",
	NONE: "none",
	SUPERHEATED: "superheated"
});

export const BURNER_HEAT_LEVEL = Object.freeze({
	NONE: 0,
	SMOULDERING: 1,
	FADING: 2,
	KINDLED: 3,
	SEETHING: 4
});

export function normalizeHeatRequirement(value) {
	if (value === undefined || value === null || value === "none")
		return HEAT_REQUIREMENT.NONE;
	if (value === "heated" || value === "superheated")
		return value;
	throw new TypeError(`Unknown heat requirement ${value}`);
}

export function isHeatSatisfied(heatLevel, requirement = HEAT_REQUIREMENT.NONE) {
	const normalized = normalizeHeatRequirement(requirement);
	if (!Number.isInteger(heatLevel) || heatLevel < BURNER_HEAT_LEVEL.NONE || heatLevel > BURNER_HEAT_LEVEL.SEETHING)
		return false;
	if (normalized === HEAT_REQUIREMENT.NONE)
		return true;
	if (normalized === HEAT_REQUIREMENT.SUPERHEATED)
		return heatLevel === BURNER_HEAT_LEVEL.SEETHING;
	return heatLevel >= BURNER_HEAT_LEVEL.FADING;
}
