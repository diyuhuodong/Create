export const EXPERIENCE_BLOCK = "createbedrock:experience_block";
export const EXPERIENCE_PARTICLE = "minecraft:endrod";

function finiteLocation(location) {
	if (!location || ![location.x, location.y, location.z].every(Number.isFinite))
		throw new TypeError("Experience block particles require a finite block location");
	return location;
}

function clamp(value, minimum, maximum) {
	return Math.max(minimum, Math.min(maximum, value));
}

/**
 * Java samples a point around the block center, clamps every component to
 * +/-0.55, then emits an end-rod particle. Bedrock's public particle call
 * has no per-particle velocity parameter, so the native endrod effect owns
 * its slow drift while this keeps the source emission volume.
 */
export function experienceBlockParticleLocation(location, random = Math.random) {
	finiteLocation(location);
	if (typeof random !== "function")
		throw new TypeError("Experience block particles require a random-number function");
	const component = () => clamp((random() * 1.5) - 0.75, -0.55, 0.55);
	return {
		x: location.x + 0.5 + component(),
		y: location.y + 0.5 + component(),
		z: location.z + 0.5 + component()
	};
}
