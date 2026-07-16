export const LINEAR_CHASSIS_BLOCKS = new Set([
	"createbedrock:linear_chassis",
	"createbedrock:secondary_linear_chassis"
]);
export const RADIAL_CHASSIS_BLOCK = "createbedrock:radial_chassis";
export const CHASSIS_BLOCKS = new Set([...LINEAR_CHASSIS_BLOCKS, RADIAL_CHASSIS_BLOCK]);
export const MAX_CHASSIS_RANGE = 16;

export const DIRECTION_VECTORS = Object.freeze({
	0: { x: 0, y: -1, z: 0 },
	1: { x: 0, y: 1, z: 0 },
	2: { x: 0, y: 0, z: -1 },
	3: { x: 0, y: 0, z: 1 },
	4: { x: -1, y: 0, z: 0 },
	5: { x: 1, y: 0, z: 0 }
});

export const CARDINAL_STICKY_PROPERTIES = Object.freeze({
	2: "createbedrock:sticky_north",
	3: "createbedrock:sticky_south",
	4: "createbedrock:sticky_west",
	5: "createbedrock:sticky_east"
});

function assertLocation(location) {
	if (![location?.x, location?.y, location?.z].every(Number.isInteger))
		throw new TypeError("Chassis locations require integer coordinates");
	return { x: location.x, y: location.y, z: location.z };
}

export function isChassis(typeId) { return CHASSIS_BLOCKS.has(typeId); }
export function isLinearChassis(typeId) { return LINEAR_CHASSIS_BLOCKS.has(typeId); }

export function chassisRange(states) {
	const value = Number(states?.["createbedrock:range"] ?? 8);
	return Number.isInteger(value) && value >= 1 && value <= MAX_CHASSIS_RANGE ? value : 8;
}

export function oppositeFacing(facing) {
	const vector = DIRECTION_VECTORS[facing];
	if (!vector)
		return undefined;
	return Object.entries(DIRECTION_VECTORS).find(([, candidate]) => candidate.x === -vector.x && candidate.y === -vector.y && candidate.z === -vector.z)?.[0];
}

export function linearStickyProperty(facing, positive = true) {
	if (!DIRECTION_VECTORS[facing])
		return undefined;
	return positive ? "createbedrock:sticky_positive" : "createbedrock:sticky_negative";
}

export function perpendicularFacings(facing) {
	const vector = DIRECTION_VECTORS[facing];
	if (!vector)
		return [];
	return Object.entries(DIRECTION_VECTORS)
		.filter(([, candidate]) => candidate.x * vector.x + candidate.y * vector.y + candidate.z * vector.z === 0)
		.map(([direction]) => direction)
		.filter(direction => DIRECTION_VECTORS[direction]);
}

export function offsetLocation(location, facing, distance = 1) {
	const origin = assertLocation(location);
	const vector = DIRECTION_VECTORS[facing];
	if (!vector || !Number.isInteger(distance))
		throw new TypeError("Chassis offsets require a cardinal facing and integer distance");
	return { x: origin.x + vector.x * distance, y: origin.y + vector.y * distance, z: origin.z + vector.z * distance };
}

export function radialStickyProperty(facing) { return CARDINAL_STICKY_PROPERTIES[facing]; }

export function radialDistance(origin, point) {
	const start = assertLocation(origin);
	const end = assertLocation(point);
	return Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z);
}
