/** Portable observable subset of Java BoilerData. World scanning, fluid
 * receipts, and KineticWorld projection belong to the boiler runtime. */
export const BOILER_MAX_HEAT_LEVEL = 18;
export const BOILER_WATER_PER_LEVEL = 10;
export const BOILER_PASSIVE_ENGINE_EFFICIENCY = 1 / 8;

function integer(value, label, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
	if (!Number.isInteger(value) || value < minimum || value > maximum)
		throw new RangeError(`${label} must be an integer from ${minimum} through ${maximum}`);
	return value;
}

export function boilerHeatForSize(tankBlocks) {
	return Math.min(BOILER_MAX_HEAT_LEVEL, Math.floor(integer(tankBlocks, "Boiler tank blocks") / 4));
}

export function boilerHeatForWater(samples) {
	if (!Array.isArray(samples) || samples.length === 0)
		throw new TypeError("Boiler water samples must be a non-empty array");
	const maximumSupply = Math.max(...samples.map(sample => integer(sample, "Boiler water supply")));
	// Java applies ceil() to the sampled float and then performs integer
	// division by ten. Samples in this portable model are already integers.
	return Math.min(BOILER_MAX_HEAT_LEVEL, Math.floor(maximumSupply / BOILER_WATER_PER_LEVEL));
}

export function boilerHeatLevel({ activeHeat = 0, passiveHeat = false, tankBlocks, waterSamples } = {}) {
	integer(activeHeat, "Boiler active heat", { maximum: BOILER_MAX_HEAT_LEVEL });
	if (typeof passiveHeat !== "boolean")
		throw new TypeError("Boiler passive heat must be boolean");
	const heat = activeHeat > 0 ? activeHeat : passiveHeat ? 1 : 0;
	return Math.min(heat, boilerHeatForSize(tankBlocks), boilerHeatForWater(waterSamples));
}

export function boilerEngineEfficiency({ activeHeat = 0, engineCount = 0, passiveHeat = false, tankBlocks, waterSamples } = {}) {
	integer(engineCount, "Boiler engine count");
	const heatLevel = boilerHeatLevel({ activeHeat, passiveHeat, tankBlocks, waterSamples });
	if (heatLevel === 0 || engineCount === 0)
		return { efficiency: 0, heatLevel };
	return {
		efficiency: passiveHeat && activeHeat === 0 ? BOILER_PASSIVE_ENGINE_EFFICIENCY / engineCount : Math.min(1, heatLevel / engineCount),
		heatLevel
	};
}
