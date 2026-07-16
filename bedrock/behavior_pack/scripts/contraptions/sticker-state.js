const FACING_VECTORS = new Map([
	[0, { x: 0, y: -1, z: 0 }], [1, { x: 0, y: 1, z: 0 }], [2, { x: 0, y: 0, z: -1 }],
	[3, { x: 0, y: 0, z: 1 }], [4, { x: -1, y: 0, z: 0 }], [5, { x: 1, y: 0, z: 0 }],
	["down", { x: 0, y: -1, z: 0 }], ["up", { x: 0, y: 1, z: 0 }], ["north", { x: 0, y: 0, z: -1 }],
	["south", { x: 0, y: 0, z: 1 }], ["west", { x: -1, y: 0, z: 0 }], ["east", { x: 1, y: 0, z: 0 }]
]);

function assertLocation(location, label) {
	if (![location?.x, location?.y, location?.z].every(Number.isInteger))
		throw new TypeError(`Sticker ${label} must use integer coordinates`);
	return { x: location.x, y: location.y, z: location.z };
}

function normalizedFacing(value) {
	if (!FACING_VECTORS.has(value))
		throw new TypeError("Sticker facing must be a supported cardinal direction");
	return value;
}

function locationKey(location) {
	return `${location.x}:${location.y}:${location.z}`;
}

export function createStickerState({ active = false, facing = 1 } = {}) {
	if (active !== true && active !== false && active !== 0 && active !== 1)
		throw new TypeError("Sticker active state must be boolean-like");
	return { active: active === true || active === 1, facing: normalizedFacing(facing) };
}

export function normalizeStickerRecord(value) {
	if (typeof value?.dimensionId !== "string" || value.dimensionId.length === 0 || value.dimensionId.length > 128)
		throw new TypeError("Sticker records require a dimension identifier");
	const location = assertLocation(value.location, "record location");
	const id = `sticker:${value.dimensionId}:${locationKey(location)}`;
	if (value.id !== undefined && value.id !== id)
		throw new Error("Sticker record identity does not match its location");
	return { dimensionId: value.dimensionId, id, location, state: createStickerState(value.state) };
}

export function stickerAttachmentTarget(location, state) {
	const source = assertLocation(location, "source location");
	const normalized = createStickerState(state);
	if (!normalized.active)
		return undefined;
	const direction = FACING_VECTORS.get(normalized.facing);
	return { x: source.x + direction.x, y: source.y + direction.y, z: source.z + direction.z };
}

/** Merge Super Glue, chassis, and Sticker edges deterministically. A self-edge
 * is invalid for a Sticker cycle and is ignored before the collector's own
 * visited set handles longer cycles. */
export function mergeAssemblyAttachmentLocations(source, ...groups) {
	source = assertLocation(source, "source location");
	const sourceKey = locationKey(source);
	const merged = new Map();
	for (const group of groups) {
		if (!Array.isArray(group))
			throw new TypeError("Assembly attachment groups must be arrays");
		for (const location of group) {
			const candidate = assertLocation(location, "attachment location");
			const key = locationKey(candidate);
			if (key !== sourceKey)
				merged.set(key, candidate);
		}
	}
	return [...merged.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, location]) => location);
}
