export const DESK_BELL_BLOCK = "createbedrock:desk_bell";
export const DESK_BELL_SOUND = "createbedrock:desk_bell";
export const DESK_BELL_PRESS_TICKS = 20;

function assertPowerState(powered) {
	if (!Number.isInteger(powered) || ![0, 1].includes(powered))
		throw new RangeError("Desk Bell power state must be 0 or 1");
	return powered;
}

export function deskBellReleaseDelay() {
	return DESK_BELL_PRESS_TICKS;
}

export function withDeskBellPower(permutation, powered) {
	if (!permutation || typeof permutation.withState !== "function")
		throw new TypeError("Desk Bell requires a mutable block permutation");
	return permutation.withState("createbedrock:powered", assertPowerState(powered));
}

export function deskBellSoundOptions() {
	return { pitch: 1, volume: 1 };
}
