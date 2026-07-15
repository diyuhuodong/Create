import { transformAssemblyPoint } from "./assembly-transform.js";

export const MOVING_CONTACT_BLOCK_TYPES = new Set([
	"createbedrock:redstone_contact",
	"createbedrock:elevator_contact"
]);

const FACING_VECTORS = {
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
};
const FACE_ALIGNMENT_EPSILON = 0.125;

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function compareEndpoint(left, right) {
	return endpointKey(left).localeCompare(endpointKey(right));
}

function endpointKey(endpoint) {
	return endpoint.kind === "assembly"
		? `assembly:${endpoint.assemblyId}:${endpoint.relative.x}:${endpoint.relative.y}:${endpoint.relative.z}`
		: `world:${endpoint.dimensionId}:${endpoint.location.x}:${endpoint.location.y}:${endpoint.location.z}`;
}

function edgeKey(left, right) {
	return [endpointKey(left), endpointKey(right)].sort().join("|");
}

function facingFor(states) {
	const value = states?.["minecraft:facing_direction"] ?? states?.facing_direction ?? states?.facing;
	const vector = FACING_VECTORS[value];
	return vector && { ...vector };
}

function isContactBlock(typeId) {
	return MOVING_CONTACT_BLOCK_TYPES.has(typeId);
}

function isOpposite(left, right) {
	return left.x === -right.x && left.y === -right.y && left.z === -right.z;
}

function near(left, right) {
	return Math.abs(left.x - right.x) <= FACE_ALIGNMENT_EPSILON
		&& Math.abs(left.y - right.y) <= FACE_ALIGNMENT_EPSILON
		&& Math.abs(left.z - right.z) <= FACE_ALIGNMENT_EPSILON;
}

function rotateFacing(transform, facing) {
	const origin = transformAssemblyPoint(transform, { x: 0, y: 0, z: 0 });
	const rotated = transformAssemblyPoint(transform, facing);
	const vector = {
		x: rotated.x - origin.x,
		y: rotated.y - origin.y,
		z: rotated.z - origin.z
	};
	const candidates = Object.values(FACING_VECTORS);
	return candidates.reduce((best, candidate) => candidate.x * vector.x + candidate.y * vector.y + candidate.z * vector.z
		> best.x * vector.x + best.y * vector.y + best.z * vector.z ? candidate : best, candidates[0]);
}

function targetLocation(center, normal) {
	const component = (value, direction) => Math.floor(value + direction * 0.5 + (direction < 0 ? -1e-9 : 0));
	return {
		x: component(center.x, normal.x),
		y: component(center.y, normal.y),
		z: component(center.z, normal.z)
	};
}

function contactsForAssembly(assembly) {
	if (typeof assembly?.id !== "string" || assembly.id.length === 0 || typeof assembly.dimensionId !== "string" || !assembly.snapshot?.anchor || !Array.isArray(assembly.snapshot.blocks) || !assembly.transform)
		throw new TypeError("Motion contact samples require dynamic assembly records");
	return assembly.snapshot.blocks
		.filter(block => isContactBlock(block.typeId))
		.map(block => {
			const facing = facingFor(block.states);
			if (!facing)
				return undefined;
			const localCenter = {
				x: block.relative.x + 0.5,
				y: block.relative.y + 0.5,
				z: block.relative.z + 0.5
			};
			const offset = transformAssemblyPoint(assembly.transform, localCenter);
			return {
				assemblyId: assembly.id,
				center: {
					x: assembly.snapshot.anchor.x + offset.x,
					y: assembly.snapshot.anchor.y + offset.y,
					z: assembly.snapshot.anchor.z + offset.z
				},
				dimensionId: assembly.dimensionId,
				normal: rotateFacing(assembly.transform, facing),
				relative: { ...block.relative },
				typeId: block.typeId
			};
		})
		.filter(Boolean);
}

function dynamicEndpoint(contact) {
	return {
		assemblyId: contact.assemblyId,
		kind: "assembly",
		relative: { ...contact.relative },
		typeId: contact.typeId
	};
}

function worldEndpoint(contact, location, typeId) {
	return {
		dimensionId: contact.dimensionId,
		kind: "world",
		location: { ...location },
		typeId
	};
}

/**
 * Derive every face-to-face contact from authoritative assembly transforms.
 * World contacts are sampled at a real block cell; dynamic contacts use their
 * transformed centres, so marker entity positions never become game logic.
 */
export function findMotionContactEdges({ assemblies, readWorldContact }) {
	if (!Array.isArray(assemblies) || typeof readWorldContact !== "function")
		throw new TypeError("Motion contact discovery requires assemblies and a world contact reader");
	const contacts = assemblies.flatMap(contactsForAssembly);
	const edges = new Map();
	for (const contact of contacts) {
		const location = targetLocation(contact.center, contact.normal);
		const worldContact = readWorldContact(contact.dimensionId, location);
		const facing = facingFor(worldContact?.states);
		if (isContactBlock(worldContact?.typeId) && facing && isOpposite(contact.normal, facing)) {
			const expectedCenter = {
				x: location.x + 0.5 - contact.normal.x,
				y: location.y + 0.5 - contact.normal.y,
				z: location.z + 0.5 - contact.normal.z
			};
			if (near(contact.center, expectedCenter)) {
				const endpoints = [dynamicEndpoint(contact), worldEndpoint(contact, location, worldContact.typeId)].sort(compareEndpoint);
				edges.set(edgeKey(...endpoints), endpoints);
			}
		}
	}
	for (let index = 0; index < contacts.length; index++) {
		const left = contacts[index];
		for (let otherIndex = index + 1; otherIndex < contacts.length; otherIndex++) {
			const right = contacts[otherIndex];
			if (left.assemblyId === right.assemblyId || left.dimensionId !== right.dimensionId || !isOpposite(left.normal, right.normal))
				continue;
			const expectedRightCenter = {
				x: left.center.x + left.normal.x,
				y: left.center.y + left.normal.y,
				z: left.center.z + left.normal.z
			};
			if (!near(right.center, expectedRightCenter))
				continue;
			const endpoints = [dynamicEndpoint(left), dynamicEndpoint(right)].sort(compareEndpoint);
			edges.set(edgeKey(...endpoints), endpoints);
		}
	}
	return [...edges.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([, endpoints]) => endpoints.map(clone));
}

function endpointCounts(edges) {
	const counts = new Map();
	for (const endpoints of edges.values())
		for (const endpoint of endpoints) {
			const key = endpointKey(endpoint);
			const current = counts.get(key);
			counts.set(key, { count: (current?.count ?? 0) + 1, endpoint });
		}
	return counts;
}

/** Tracks rising/falling contact edges while allowing several contacts per endpoint. */
export class MotionContactTracker {
	#edges = new Map();

	sample(input) {
		const next = new Map(findMotionContactEdges(input).map(endpoints => [edgeKey(...endpoints), endpoints]));
		const previousCounts = endpointCounts(this.#edges);
		const nextCounts = endpointCounts(next);
		const changes = [];
		for (const key of new Set([...previousCounts.keys(), ...nextCounts.keys()])) {
			const before = previousCounts.get(key);
			const after = nextCounts.get(key);
			if ((before?.count ?? 0) === 0 && (after?.count ?? 0) > 0)
				changes.push({ active: true, endpoint: clone(after.endpoint) });
			if ((before?.count ?? 0) > 0 && (after?.count ?? 0) === 0)
				changes.push({ active: false, endpoint: clone(before.endpoint) });
		}
		this.#edges = next;
		return changes.sort((left, right) => endpointKey(left.endpoint).localeCompare(endpointKey(right.endpoint)));
	}

	releaseAssembly(assemblyId) {
		if (typeof assemblyId !== "string" || assemblyId.length === 0)
			throw new TypeError("Motion contact releases require an assembly identifier");
		const retained = new Map([...this.#edges].filter(([, endpoints]) => !endpoints.some(endpoint => endpoint.kind === "assembly" && endpoint.assemblyId === assemblyId)));
		const previousCounts = endpointCounts(this.#edges);
		const nextCounts = endpointCounts(retained);
		this.#edges = retained;
		return [...previousCounts.entries()]
			.filter(([key]) => !nextCounts.has(key))
			.map(([, value]) => ({ active: false, endpoint: clone(value.endpoint) }))
			.sort((left, right) => endpointKey(left.endpoint).localeCompare(endpointKey(right.endpoint)));
	}

	diagnostics() {
		return { activeEdges: this.#edges.size };
	}
}
