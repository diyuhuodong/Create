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

function axisForDirection(direction) {
	if (direction.x !== 0)
		return "x";
	if (direction.y !== 0)
		return "y";
	if (direction.z !== 0)
		return "z";
	throw new TypeError("Fluid directions require one non-zero axis");
}

function hash(value) {
	let result = 0x811c9dc5;
	for (let index = 0; index < value.length; index++) {
		result ^= value.charCodeAt(index);
		result = Math.imul(result, 0x01000193);
	}
	return (result >>> 0).toString(16).padStart(8, "0");
}

function negate(offset) {
	return { x: -offset.x, y: -offset.y, z: -offset.z };
}

function normalizedDevice(device) {
	if (!device || typeof device.kind !== "string" || !FLUID_FACING_OFFSETS[device.facing])
		return undefined;
	assertDeviceKind(device.kind);
	assertLocation(device.location);
	if (typeof device.dimensionId !== "string" || device.dimensionId.length === 0)
		throw new TypeError("Fluid topology devices require a dimension identifier");
	return {
		...device,
		direction: FLUID_FACING_OFFSETS[device.facing],
		id: fluidDeviceId(device.kind, device.dimensionId, device.location)
	};
}

function runId(kind, device) {
	return device.members.length === 1
		? device.members[0]
		: `fluid-run:${kind}:${hash(`${device.dimensionId}:${device.members.join("|")}`)}`;
}

function traceEndpoint({ deviceAt, direction, endpointAt, start }) {
	const members = [start.id];
	const axis = axisForDirection(direction);
	let location = { ...start.location };
	for (let steps = 0; steps < 64; steps++) {
		location = offsetFluidLocation(location, direction);
		const endpoint = endpointAt(location);
		if (endpoint)
			return { endpoint, members };
		const next = normalizedDevice(deviceAt(location));
		if (!next || next.kind !== "pipe" || axisForDirection(next.direction) !== axis)
			return undefined;
		members.push(next.id);
	}
	return undefined;
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

/**
 * Finds one straight physical pipe run. Pipes are bidirectional, while a
 * mechanical pump remains directional. A run is emitted only by its
 * lexicographically first device, so placement events can safely rescan all
 * neighboring devices without creating duplicate links.
 */
export function configureFluidRun({ createLink, destinationAt, device, deviceAt, hasLink = () => false, sourceAt }) {
	const start = normalizedDevice(device);
	if (!start)
		return { ok: false, reason: "invalid_device" };
	if (typeof createLink !== "function" || typeof deviceAt !== "function" || typeof hasLink !== "function" || typeof sourceAt !== "function" || typeof destinationAt !== "function")
		throw new TypeError("Fluid run topology requires device, endpoint, and link callbacks");

	const backwards = traceEndpoint({ deviceAt, direction: negate(start.direction), endpointAt: sourceAt, start });
	const forwards = traceEndpoint({ deviceAt, direction: start.direction, endpointAt: destinationAt, start });
	if (!backwards || !forwards)
		return { ok: false, reason: "endpoints_missing" };
	const members = [...new Set([...backwards.members, ...forwards.members])].sort();
	// A pump is the sole directed controller of its run. A normal pipe run has
	// no pump member and is instead owned by its lexicographically first pipe.
	if (start.kind === "pipe" && start.id !== members[0])
		return { members, ok: false, reason: "noncanonical_device" };
	const run = { dimensionId: start.dimensionId, members };
	const baseId = runId(start.kind, run);
	const links = start.kind === "pump"
		? [{ destinationId: forwards.endpoint, id: baseId, kind: "pump", members, sourceId: backwards.endpoint }]
		: [
			{ destinationId: forwards.endpoint, id: baseId, kind: "pipe", members, sourceId: backwards.endpoint },
			{ destinationId: backwards.endpoint, id: `${baseId}:reverse`, kind: "pipe", members, sourceId: forwards.endpoint }
		];
	let created = 0;
	for (const link of links) {
		if (hasLink(link.id))
			continue;
		createLink(link);
		created++;
	}
	return { id: baseId, links, members, ok: true, reused: created === 0 };
}

export function configureFluidDevice({ createLink, destinationAt, device, facing, hasLink = () => false, kind, sourceAt, tankAt }) {
	assertDeviceKind(kind);
	if (!device || typeof device.dimensionId !== "string")
		throw new TypeError("Fluid topology devices require a dimension identifier");
	assertLocation(device.location);
	const sourceEndpointAt = sourceAt ?? tankAt;
	const destinationEndpointAt = destinationAt ?? tankAt;
	if (typeof createLink !== "function" || typeof hasLink !== "function" || typeof sourceEndpointAt !== "function" || typeof destinationEndpointAt !== "function")
		throw new TypeError("Fluid topology requires link and tank callbacks");
	const direction = FLUID_FACING_OFFSETS[facing];
	if (!direction)
		return { ok: false, reason: "invalid_facing" };
	const id = fluidDeviceId(kind, device.dimensionId, device.location);
	if (hasLink(id))
		return { id, ok: true, reused: true };
	const sourceId = sourceEndpointAt(offsetFluidLocation(device.location, { x: -direction.x, y: -direction.y, z: -direction.z }));
	const destinationId = destinationEndpointAt(offsetFluidLocation(device.location, direction));
	if (!sourceId || !destinationId)
		return { ok: false, reason: "endpoints_missing" };
	createLink({ destinationId, id, sourceId });
	return { id, ok: true, reused: false };
}
