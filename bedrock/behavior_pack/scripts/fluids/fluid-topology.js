export const FLUID_FACING_OFFSETS = Object.freeze({
	0: { x: 0, y: -1, z: 0 },
	1: { x: 0, y: 1, z: 0 },
	2: { x: 0, y: 0, z: -1 },
	3: { x: 0, y: 0, z: 1 },
	4: { x: -1, y: 0, z: 0 },
	5: { x: 1, y: 0, z: 0 },
	down: { x: 0, y: -1, z: 0 },
	east: { x: 1, y: 0, z: 0 },
	north: { x: 0, y: 0, z: -1 },
	south: { x: 0, y: 0, z: 1 },
	up: { x: 0, y: 1, z: 0 },
	west: { x: -1, y: 0, z: 0 }
});

function assertLocation(location) {
	if (!location || !Number.isInteger(location.x) || !Number.isInteger(location.y) || !Number.isInteger(location.z))
		throw new TypeError("Fluid device locations require integer x, y, and z coordinates");
	return location;
}

function assertDeviceKind(kind) {
	if (kind !== "pipe" && kind !== "pump")
		throw new TypeError("Fluid device kinds must be pipe or pump");
	return kind;
}

export function fluidDeviceId(kind, dimensionId, location) {
	assertDeviceKind(kind);
	if (typeof dimensionId !== "string" || dimensionId.length === 0)
		throw new TypeError("Fluid devices require a dimension identifier");
	const normalized = assertLocation(location);
	return `${kind}:${dimensionId}:${normalized.x}:${normalized.y}:${normalized.z}`;
}

export function fluidDeviceLocation(kind, id) {
	assertDeviceKind(kind);
	if (typeof id !== "string" || !id.startsWith(`${kind}:`))
		return undefined;
	const parts = id.slice(kind.length + 1).split(":");
	if (parts.length < 4)
		return undefined;
	const coordinates = parts.slice(-3).map(Number);
	const dimensionId = parts.slice(0, -3).join(":");
	if (!dimensionId || coordinates.some(coordinate => !Number.isInteger(coordinate)))
		return undefined;
	return {
		dimensionId,
		location: { x: coordinates[0], y: coordinates[1], z: coordinates[2] }
	};
}

export function offsetFluidLocation(location, offset) {
	const normalized = assertLocation(location);
	if (!offset || !Number.isInteger(offset.x) || !Number.isInteger(offset.y) || !Number.isInteger(offset.z))
		throw new TypeError("Fluid device offsets require integer x, y, and z coordinates");
	return { x: normalized.x + offset.x, y: normalized.y + offset.y, z: normalized.z + offset.z };
}

export function configureFluidDevice({ createLink, device, facing, hasLink = () => false, kind, tankAt }) {
	assertDeviceKind(kind);
	if (!device || typeof device.dimensionId !== "string")
		throw new TypeError("Fluid topology devices require a dimension identifier");
	assertLocation(device.location);
	if (typeof createLink !== "function" || typeof hasLink !== "function" || typeof tankAt !== "function")
		throw new TypeError("Fluid topology requires link and tank callbacks");
	const direction = FLUID_FACING_OFFSETS[facing];
	if (!direction)
		return { ok: false, reason: "invalid_facing" };
	const id = fluidDeviceId(kind, device.dimensionId, device.location);
	if (hasLink(id))
		return { id, ok: true, reused: true };
	const sourceId = tankAt(offsetFluidLocation(device.location, { x: -direction.x, y: -direction.y, z: -direction.z }));
	const destinationId = tankAt(offsetFluidLocation(device.location, direction));
	if (!sourceId || !destinationId)
		return { ok: false, reason: "endpoints_missing" };
	createLink({ destinationId, id, sourceId });
	return { id, ok: true, reused: false };
}
