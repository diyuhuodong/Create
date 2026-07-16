export const SLIDING_DOOR_BLOCKS = Object.freeze(new Set([
	"createbedrock:andesite_door",
	"createbedrock:brass_door",
	"createbedrock:copper_door",
	"createbedrock:framed_glass_door",
	"createbedrock:train_door"
]));
export const DOOR_HALF_STATE = "createbedrock:half";
export const DOOR_HINGE_STATE = "createbedrock:hinge";
export const DOOR_OPEN_STATE = "createbedrock:open";
export const DOOR_POWERED_STATE = "createbedrock:powered";

export function isSlidingDoor(typeId) {
	return SLIDING_DOOR_BLOCKS.has(typeId);
}

export function doorStatesForPower(powerLevel) {
	if (!Number.isInteger(powerLevel) || powerLevel < 0 || powerLevel > 15)
		throw new RangeError("Sliding Door redstone power must be an integer from 0 through 15");
	const powered = powerLevel > 0 ? 1 : 0;
	return { open: powered, powered };
}

export function normalizeDoorState({ half = 0, hinge = 0, open = 0, powered = 0 } = {}) {
	for (const [name, value] of Object.entries({ half, hinge, open, powered }))
		if (!Number.isInteger(value) || (value !== 0 && value !== 1))
			throw new RangeError(`Sliding Door ${name} state must be 0 or 1`);
	return { half, hinge, open, powered };
}

export function toggledDoorState(states) {
	const current = normalizeDoorState(states);
	return { ...current, open: current.open === 0 ? 1 : 0 };
}

export function doorPairLocation(location, half) {
	if (!location || !Number.isInteger(location.x) || !Number.isInteger(location.y) || !Number.isInteger(location.z))
		throw new TypeError("Sliding Door locations must be integer block coordinates");
	if (half !== 0 && half !== 1)
		throw new RangeError("Sliding Door half must be 0 (lower) or 1 (upper)");
	return { x: location.x, y: location.y + (half === 0 ? 1 : -1), z: location.z };
}

export function doorLateralOffset(facing, hinge) {
	if (!Number.isInteger(facing) || ![2, 3, 4, 5].includes(facing) || (hinge !== 0 && hinge !== 1))
		throw new RangeError("Sliding Door double-door matching requires a horizontal facing and binary hinge");
	const offsets = {
		2: hinge === 0 ? { x: 1, y: 0, z: 0 } : { x: -1, y: 0, z: 0 },
		3: hinge === 0 ? { x: -1, y: 0, z: 0 } : { x: 1, y: 0, z: 0 },
		4: hinge === 0 ? { x: 0, y: 0, z: -1 } : { x: 0, y: 0, z: 1 },
		5: hinge === 0 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 0, z: -1 }
	};
	return offsets[facing];
}
