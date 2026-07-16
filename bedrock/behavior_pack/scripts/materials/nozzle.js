export const NOZZLE_BLOCK = "createbedrock:nozzle";
export const ENCASED_FAN_BLOCK = "createbedrock:encased_fan";
export const FAN_ROTATION_ARGMAX = 256;
export const NOZZLE_MIN_RANGE = 3;
export const NOZZLE_MAX_RANGE = 20;

export const DIRECTION_VECTORS = Object.freeze({
	0: { x: 0, y: -1, z: 0 },
	1: { x: 0, y: 1, z: 0 },
	2: { x: 0, y: 0, z: -1 },
	3: { x: 0, y: 0, z: 1 },
	4: { x: -1, y: 0, z: 0 },
	5: { x: 1, y: 0, z: 0 }
});

export function nozzleRangeForSpeed(speed) {
	if (!Number.isFinite(speed) || speed === 0)
		return 0;
	const factor = Math.min(Math.abs(speed) / FAN_ROTATION_ARGMAX, 1);
	return NOZZLE_MIN_RANGE + (NOZZLE_MAX_RANGE - NOZZLE_MIN_RANGE) * factor;
}

export function nozzleFanLocation(location, facing) {
	const direction = DIRECTION_VECTORS[facing];
	if (!direction || !location || !Number.isInteger(location.x) || !Number.isInteger(location.y) || !Number.isInteger(location.z))
		throw new TypeError("Nozzle locations require an integer location and a valid facing direction");
	return { x: location.x - direction.x, y: location.y - direction.y, z: location.z - direction.z };
}

export function nozzleImpulse({ distance, entityTypeId, pushing, range, vector }) {
	if (!Number.isFinite(distance) || !Number.isFinite(range) || !vector || distance <= 0 || distance > range)
		return undefined;
	if (!pushing && distance < 1.5)
		return undefined;
	const sign = pushing ? 1 : -1;
	const factor = entityTypeId === "minecraft:item" ? 1 / 128 : 1 / 32;
	const magnitude = (range - distance) * factor * sign;
	const component = value => value === 0 ? 0 : value;
	return { x: component(vector.x / distance * magnitude), y: component(vector.y / distance * magnitude), z: component(vector.z / distance * magnitude) };
}
