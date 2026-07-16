export const STEAM_WHISTLE_BLOCK = "createbedrock:steam_whistle";
export const STEAM_WHISTLE_EXTENSION_BLOCK = "createbedrock:steam_whistle_extension";
export const WHISTLE_SIZES = Object.freeze(["small", "medium", "large"]);
export const MAX_WHISTLE_EXTENSION_HEIGHT = 6;

export function isSteamWhistle(typeId) {
	return typeId === STEAM_WHISTLE_BLOCK;
}

export function isSteamWhistleExtension(typeId) {
	return typeId === STEAM_WHISTLE_EXTENSION_BLOCK;
}

export function whistleSizeName(size) {
	if (!Number.isInteger(size) || size < 0 || size >= WHISTLE_SIZES.length)
		throw new RangeError("Steam Whistle size must be small, medium, or large");
	return WHISTLE_SIZES[size];
}

/** Java counts a full extension as two semitones and a single top as one. */
export function whistlePitch(extensionShapes) {
	if (!Array.isArray(extensionShapes) || extensionShapes.length > MAX_WHISTLE_EXTENSION_HEIGHT)
		throw new RangeError("Steam Whistle accepts up to six extension segments");
	let pitch = 0;
	for (const shape of extensionShapes) {
		if (!Number.isInteger(shape) || shape < 0 || shape > 2)
			throw new RangeError("Steam Whistle extension shapes must be single, double, or connected");
		pitch += shape === 0 ? 1 : 2;
	}
	return Math.min(24, pitch);
}

export function whistleSoundPitch(semitones) {
	if (!Number.isInteger(semitones) || semitones < 0 || semitones > 24)
		throw new RangeError("Steam Whistle pitch must be between zero and 24 semitones");
	return 2 ** (-semitones / 12);
}

export function nextWhistleSize(size) {
	if (!Number.isInteger(size) || size < 0 || size > 2)
		throw new RangeError("Steam Whistle size must be 0, 1, or 2");
	return (size + 1) % 3;
}
