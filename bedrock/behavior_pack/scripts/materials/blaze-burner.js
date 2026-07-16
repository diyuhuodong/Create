export const BLAZE_BURNER_BLOCK = "createbedrock:blaze_burner";
export const LIT_BLAZE_BURNER_BLOCK = "createbedrock:lit_blaze_burner";
export const EMPTY_BLAZE_BURNER = "createbedrock:empty_blaze_burner";

export const BURNER_HEAT = Object.freeze({
	NONE: 0,
	SMOULDERING: 1,
	FADING: 2,
	KINDLED: 3,
	SEETHING: 4
});

export const BURNER_FUEL = Object.freeze({
	NONE: "none",
	NORMAL: "normal",
	SPECIAL: "special",
	CREATIVE: "creative"
});

export const MAX_HEAT_CAPACITY = 10000;
export const INSERTION_THRESHOLD = 500;
export const SPECIAL_FUEL_DURATION = 3200;
export const SPECIAL_COOLDOWN_DURATION = MAX_HEAT_CAPACITY / 2;

const NORMAL_FUEL_DURATION = new Map([
	["minecraft:coal", 1600],
	["minecraft:charcoal", 1600],
	["minecraft:coal_block", 16000],
	["minecraft:blaze_rod", 2400],
	["minecraft:dried_kelp_block", 4001],
	["minecraft:lava_bucket", 20000],
	["minecraft:wood", 300],
	["minecraft:planks", 300],
	["minecraft:stick", 100],
	["minecraft:bamboo", 50]
]);

function clone(record) {
	return record && { fuel: record.fuel, remaining: record.remaining };
}

function fuelRank(fuel) {
	return ({ [BURNER_FUEL.NONE]: 0, [BURNER_FUEL.NORMAL]: 1, [BURNER_FUEL.SPECIAL]: 2, [BURNER_FUEL.CREATIVE]: 3 })[fuel] ?? -1;
}

export function fuelForItem(typeId) {
	if (typeId === "createbedrock:creative_blaze_cake")
		return { fuel: BURNER_FUEL.CREATIVE, remaining: 0 };
	if (typeId === "createbedrock:blaze_cake")
		return { fuel: BURNER_FUEL.SPECIAL, remaining: SPECIAL_FUEL_DURATION };
	const duration = NORMAL_FUEL_DURATION.get(typeId);
	return duration ? { fuel: BURNER_FUEL.NORMAL, remaining: duration } : undefined;
}

export function heatForFuel(record) {
	if (!record || record.fuel === BURNER_FUEL.NONE)
		return BURNER_HEAT.NONE;
	if (record.fuel === BURNER_FUEL.SPECIAL || record.fuel === BURNER_FUEL.CREATIVE)
		return BURNER_HEAT.SEETHING;
	return record.remaining / MAX_HEAT_CAPACITY < 0.0125 ? BURNER_HEAT.FADING : BURNER_HEAT.KINDLED;
}

// Mirrors BlazeBurnerBlockEntity#tryUpdateFuel: higher heat replaces lower
// heat; equivalent normal fuel can overflow to the Java heat-capacity limit.
export function insertBurnerFuel(current, offered, { forceOverflow = true } = {}) {
	if (!offered || fuelRank(offered.fuel) <= 0)
		return { accepted: false, record: clone(current) };
	const record = clone(current) ?? { fuel: BURNER_FUEL.NONE, remaining: 0 };
	if (record.fuel === BURNER_FUEL.CREATIVE || fuelRank(offered.fuel) < fuelRank(record.fuel))
		return { accepted: false, record };
	if (offered.fuel === BURNER_FUEL.CREATIVE)
		return { accepted: true, record: { fuel: BURNER_FUEL.CREATIVE, remaining: 0 } };
	if (offered.fuel !== record.fuel)
		return { accepted: true, record: clone(offered) };
	if (record.remaining <= INSERTION_THRESHOLD)
		return { accepted: true, record: { ...record, remaining: record.remaining + offered.remaining } };
	if (forceOverflow && record.fuel === BURNER_FUEL.NORMAL)
		return { accepted: true, record: { ...record, remaining: Math.min(MAX_HEAT_CAPACITY, record.remaining + offered.remaining) } };
	return { accepted: false, record };
}

// A special (blaze-cake) burn expires into the same five-thousand-tick normal
// heat tail used by Create. Undefined means the block returns to unheated.
export function tickBurnerFuel(current) {
	const record = clone(current);
	if (!record || record.fuel === BURNER_FUEL.NONE)
		return undefined;
	if (record.fuel === BURNER_FUEL.CREATIVE)
		return record;
	if (record.remaining > 1)
		return { ...record, remaining: record.remaining - 1 };
	if (record.fuel === BURNER_FUEL.SPECIAL)
		return { fuel: BURNER_FUEL.NORMAL, remaining: SPECIAL_COOLDOWN_DURATION };
	return undefined;
}
