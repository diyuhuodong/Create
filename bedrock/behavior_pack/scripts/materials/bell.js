export const PECULIAR_BELL_BLOCK = "createbedrock:peculiar_bell";
export const HAUNTED_BELL_BLOCK = "createbedrock:haunted_bell";
export const BELL_BLOCKS = Object.freeze(new Set([PECULIAR_BELL_BLOCK, HAUNTED_BELL_BLOCK]));
export const BELL_RING_DURATION = 74;
export const HAUNTED_BELL_RECHARGE_TICKS = 65;
export const HAUNTED_BELL_EFFECT_TICKS = 20;
export const HAUNTED_BELL_PULSE_DISTANCE = 10;
export const HAUNTED_BELL_HELD_DISTANCE = 3;
export const HAUNTED_BELL_HELD_RECHARGE_TICKS = 8;
export const HAUNTED_BELL_HELD_WARMUP_TICKS = 10;

export function isBell(typeId) {
	return BELL_BLOCKS.has(typeId);
}

export function bellPowerState(powerLevel) {
	if (!Number.isInteger(powerLevel) || powerLevel < 0 || powerLevel > 15)
		throw new RangeError("Bell redstone power must be an integer from 0 through 15");
	return powerLevel > 0 ? 1 : 0;
}

export function nextBellTicks({ ringingTicks = 0, effectTicks = 0 }) {
	if (!Number.isInteger(ringingTicks) || ringingTicks < 0 || ringingTicks > BELL_RING_DURATION
		|| !Number.isInteger(effectTicks) || effectTicks < 0 || effectTicks > HAUNTED_BELL_EFFECT_TICKS)
		throw new RangeError("Bell runtime counters are outside their supported ranges");
	return {
		ringingTicks: ringingTicks === 0 ? 0 : ringingTicks >= BELL_RING_DURATION ? 0 : ringingTicks + 1,
		effectTicks: Math.max(0, effectTicks - 1)
	};
}

export function bellCanRing(typeId, ringingTicks = 0) {
	if (!isBell(typeId))
		return false;
	return typeId !== HAUNTED_BELL_BLOCK || ringingTicks === 0 || ringingTicks >= HAUNTED_BELL_RECHARGE_TICKS;
}

export function bellRingState(typeId) {
	if (!isBell(typeId))
		throw new TypeError("Unknown bell type");
	return { ringingTicks: 1, effectTicks: typeId === HAUNTED_BELL_BLOCK ? HAUNTED_BELL_EFFECT_TICKS : 0 };
}

export function shouldHauntPeculiarBell(typeId, blockBelow) {
	return typeId === PECULIAR_BELL_BLOCK && ["minecraft:soul_fire", "minecraft:soul_campfire"].includes(blockBelow);
}
