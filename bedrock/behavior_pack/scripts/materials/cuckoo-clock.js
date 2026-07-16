export const CUCKOO_CLOCK_BLOCK = "createbedrock:cuckoo_clock";
export const MYSTERIOUS_CUCKOO_CLOCK_BLOCK = "createbedrock:mysterious_cuckoo_clock";
export const CUCKOO_CLOCK_BLOCKS = Object.freeze(new Set([CUCKOO_CLOCK_BLOCK, MYSTERIOUS_CUCKOO_CLOCK_BLOCK]));
export const CLOCK_ANIMATION = Object.freeze({ NONE: 0, PIG: 1, CREEPER: 2, SURPRISE: 3 });
export const CUCKOO_CLOCK_ANIMATION_TICKS = 101;
export const CUCKOO_SURPRISE_TICK = 50;

export function isCuckooClock(typeId) {
	return CUCKOO_CLOCK_BLOCKS.has(typeId);
}

export function isMysteriousCuckooClock(typeId) {
	return typeId === MYSTERIOUS_CUCKOO_CLOCK_BLOCK;
}

export function clockCanRun(speed) {
	return Number.isFinite(speed) && speed !== 0;
}

/** Converts the Bedrock absolute tick counter to the Java clock's 24-hour dial. */
export function cuckooClockTime(absoluteTime, naturalDimension = true) {
	if (!Number.isInteger(absoluteTime) || absoluteTime < 0)
		throw new RangeError("Cuckoo Clock time must be a non-negative integer tick count");
	const dayTime = (absoluteTime * (naturalDimension ? 1 : 24)) % 24000;
	return {
		hours: (Math.floor(dayTime / 1000) + 6) % 24,
		minutes: Math.floor((dayTime % 1000) * 60 / 1000)
	};
}

export function cuckooClockHand(hours, minutes) {
	if (!Number.isInteger(hours) || hours < 0 || hours > 23 || !Number.isInteger(minutes) || minutes < 0 || minutes > 59)
		throw new RangeError("Cuckoo Clock hands require 24-hour hours and 0-59 minutes");
	return {
		hour: hours % 12,
		minute: Math.floor(minutes / 5)
	};
}

/** Java triggers the regular show only in natural dimensions. */
export function cuckooClockAnimation({ hours, minutes, mysterious = false, naturalDimension = true }) {
	if (!naturalDimension)
		return CLOCK_ANIMATION.NONE;
	if (!Number.isInteger(hours) || !Number.isInteger(minutes))
		throw new TypeError("Cuckoo Clock animation checks require integer time values");
	const normal = hours === 12 && minutes < 5
		? CLOCK_ANIMATION.PIG
		: hours === 18 && minutes > 31 && minutes < 36
			? CLOCK_ANIMATION.CREEPER
			: CLOCK_ANIMATION.NONE;
	return mysterious && normal !== CLOCK_ANIMATION.NONE ? CLOCK_ANIMATION.SURPRISE : normal;
}

export function nextCuckooAnimation({ animation, progress }) {
	if (!Number.isInteger(animation) || !Object.values(CLOCK_ANIMATION).includes(animation))
		throw new RangeError("Cuckoo Clock animation must be a declared animation value");
	if (!Number.isInteger(progress) || progress < 0 || progress > CUCKOO_CLOCK_ANIMATION_TICKS)
		throw new RangeError("Cuckoo Clock animation progress is outside its 101 tick window");
	if (animation === CLOCK_ANIMATION.NONE)
		return { animation, progress, finished: false, surprise: false };
	const nextProgress = progress + 1;
	return {
		animation: nextProgress > CUCKOO_CLOCK_ANIMATION_TICKS ? CLOCK_ANIMATION.NONE : animation,
		progress: nextProgress > CUCKOO_CLOCK_ANIMATION_TICKS ? 0 : nextProgress,
		finished: nextProgress > CUCKOO_CLOCK_ANIMATION_TICKS,
		surprise: animation === CLOCK_ANIMATION.SURPRISE && nextProgress === CUCKOO_SURPRISE_TICK
	};
}
