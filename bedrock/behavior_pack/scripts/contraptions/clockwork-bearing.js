export const CLOCKWORK_BEARING_BLOCK = "createbedrock:clockwork_bearing";
export const CLOCKWORK_HAND_MODES = Object.freeze(["hour_first", "minute_first", "hour_first_24"]);

function normalizeDegrees(value) {
	return (value % 360 + 360) % 360;
}

export function clockworkTargetAngle(dayTime, mode = 0, facingSign = 1) {
	if (!Number.isFinite(dayTime))
		throw new TypeError("Clockwork bearings require finite day time");
	if (!Number.isInteger(mode) || mode < 0 || mode >= CLOCKWORK_HAND_MODES.length)
		throw new RangeError("Clockwork bearings require a supported hand mode");
	if (![1, -1].includes(facingSign))
		throw new RangeError("Clockwork bearings require a facing sign of one or minus one");
	const normalized = ((Math.floor(dayTime) % 24000) + 24000) % 24000;
	const hours = (Math.floor(normalized / 1000) + 6) % 24;
	const minutes = Math.floor(normalized % 1000 * 60 / 1000);
	const degrees = mode === 1 ? minutes * 6 : mode === 2 ? hours * 15 : (hours % 12) * 30;
	return normalizeDegrees(-facingSign * degrees);
}

export function shortestClockworkDelta(currentDegrees, targetDegrees) {
	if (![currentDegrees, targetDegrees].every(Number.isFinite))
		throw new TypeError("Clockwork angles must be finite");
	return ((targetDegrees - currentDegrees + 540) % 360) - 180;
}

/** Advance towards the authoritative world-time target without overshoot. */
export function nextClockworkAngle(currentDegrees, targetDegrees, kineticSpeed) {
	if (!Number.isFinite(kineticSpeed))
		throw new TypeError("Clockwork speed must be finite");
	if (kineticSpeed === 0)
		return normalizeDegrees(currentDegrees);
	const delta = shortestClockworkDelta(currentDegrees, targetDegrees);
	const step = Math.max(.1, Math.abs(kineticSpeed) * .3);
	return normalizeDegrees(currentDegrees + Math.sign(delta) * Math.min(Math.abs(delta), step));
}
