export const REDSTONE_LINK_RANGE = 256;

function assertToken(value) {
	if (typeof value !== "string" || value.length === 0 || value.length > 128)
		throw new TypeError("Redstone link frequency tokens must be non-empty strings of at most 128 characters");
	return value;
}

export function normalizeRedstoneLinkFrequency(value) {
	if (!Array.isArray(value) || value.length !== 2)
		throw new TypeError("Redstone links require exactly two frequency tokens");
	return [assertToken(value[0]), assertToken(value[1])];
}

export function redstoneLinkFrequencyKey(value) {
	return normalizeRedstoneLinkFrequency(value).map(encodeURIComponent).join("|");
}

export function redstoneLinksWithinRange(left, right, range = REDSTONE_LINK_RANGE) {
	if (!Number.isFinite(range) || range < 0)
		throw new RangeError("Redstone link ranges must be non-negative finite distances");
	if (!left || !right || !Number.isFinite(left.x) || !Number.isFinite(left.y) || !Number.isFinite(left.z)
		|| !Number.isFinite(right.x) || !Number.isFinite(right.y) || !Number.isFinite(right.z))
		throw new TypeError("Redstone link locations must use finite coordinates");
	const dx = left.x - right.x;
	const dy = left.y - right.y;
	const dz = left.z - right.z;
	return dx * dx + dy * dy + dz * dz <= range * range;
}

/** Return the strongest reachable transmitter, matching Create's 0..15 analogue link output. */
export function receivedRedstoneLinkPower({ frequency, receiver, transmitters, range = REDSTONE_LINK_RANGE }) {
	const key = redstoneLinkFrequencyKey(frequency);
	if (!Array.isArray(transmitters))
		throw new TypeError("Redstone link transmitters must be an array");
	let power = 0;
	for (const transmitter of transmitters) {
		if (!transmitter || transmitter.key !== key || !Number.isInteger(transmitter.power)
			|| transmitter.power < 0 || transmitter.power > 15)
			continue;
		if (redstoneLinksWithinRange(receiver, transmitter.location, range))
			power = Math.max(power, transmitter.power);
	}
	return power;
}
