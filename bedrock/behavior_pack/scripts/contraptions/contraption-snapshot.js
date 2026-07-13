const NEIGHBOR_OFFSETS = [
	[1, 0, 0],
	[-1, 0, 0],
	[0, 1, 0],
	[0, -1, 0],
	[0, 0, 1],
	[0, 0, -1]
];

function locationKey(location) {
	return `${location.x}:${location.y}:${location.z}`;
}

function clone(value) {
	return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function stableStringify(value) {
	if (value === null || typeof value !== "object")
		return JSON.stringify(value);
	if (Array.isArray(value))
		return `[${value.map(stableStringify).join(",")}]`;
	return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function checksumFor(payload) {
	let hash = 0x811c9dc5;
	for (const character of stableStringify(payload)) {
		hash ^= character.charCodeAt(0);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

function validateLocation(location, label) {
	if (!Number.isInteger(location?.x) || !Number.isInteger(location?.y) || !Number.isInteger(location?.z))
		throw new TypeError(`${label} must use integer block coordinates`);
}

function normalizedBlock(block) {
	validateLocation(block?.relative, "Contraption block relative location");
	if (typeof block?.typeId !== "string" || block.typeId.length === 0)
		throw new TypeError("Contraption blocks require a typeId");
	const normalized = {
		relative: { ...block.relative },
		typeId: block.typeId
	};
	if (block.states !== undefined)
		normalized.states = clone(block.states);
	if (block.data !== undefined)
		normalized.data = clone(block.data);
	return normalized;
}

function normalizedPayload(snapshot) {
	validateLocation(snapshot?.anchor, "Contraption anchor");
	if (!Array.isArray(snapshot.blocks) || snapshot.blocks.length === 0)
		throw new TypeError("Contraption snapshots require at least one block");
	const blocks = snapshot.blocks.map(normalizedBlock)
		.sort((left, right) => locationKey(left.relative).localeCompare(locationKey(right.relative)));
	return { anchor: { ...snapshot.anchor }, blocks };
}

function sealSnapshot(payload) {
	const normalized = normalizedPayload(payload);
	return {
		schemaVersion: 2,
		checksum: checksumFor(normalized),
		...normalized
	};
}

export function normalizeContraptionSnapshot(snapshot) {
	if (snapshot?.schemaVersion !== 1 && snapshot?.schemaVersion !== 2)
		throw new TypeError("Unsupported contraption snapshot");
	const payload = normalizedPayload(snapshot);
	if (snapshot.schemaVersion === 1)
		return sealSnapshot(payload);
	if (typeof snapshot.checksum !== "string" || snapshot.checksum !== checksumFor(payload))
		throw new Error("Contraption snapshot checksum mismatch");
	return sealSnapshot(payload);
}

function rotateY(location, quarterTurns) {
	switch ((quarterTurns % 4 + 4) % 4) {
		case 0:
			return { ...location };
		case 1:
			return { x: -location.z, y: location.y, z: location.x };
		case 2:
			return { x: -location.x, y: location.y, z: -location.z };
		case 3:
			return { x: location.z, y: location.y, z: -location.x };
	}
}

function rotateFacingDirection(value, quarterTurns) {
	const numeric = { 2: 5, 5: 3, 3: 4, 4: 2 };
	const named = { north: "east", east: "south", south: "west", west: "north" };
	let rotated = value;
	for (let index = 0; index < (quarterTurns % 4 + 4) % 4; index++)
		rotated = numeric[rotated] ?? named[rotated] ?? rotated;
	return rotated;
}

function rotateStatesY(states, quarterTurns) {
	const rotated = clone(states);
	if (!rotated)
		return rotated;
	for (const key of ["minecraft:facing_direction", "minecraft:cardinal_direction"])
		if (key in rotated)
			rotated[key] = rotateFacingDirection(rotated[key], quarterTurns);
	return rotated;
}

export function createContraptionSnapshot({ anchor, blocks, maxBlocks = 256 }) {
	validateLocation(anchor, "Contraption anchor");
	if (!Array.isArray(blocks) || blocks.length === 0)
		throw new TypeError("Contraptions require at least one block");
	if (blocks.length > maxBlocks)
		throw new RangeError(`Contraption exceeds the ${maxBlocks} block prototype limit`);

	const sourceBlocks = new Map();
	for (const block of blocks) {
		validateLocation(block.location, "Contraption block location");
		if (typeof block.typeId !== "string" || block.typeId.length === 0)
			throw new TypeError("Contraption blocks require a typeId");

		const key = locationKey(block.location);
		if (sourceBlocks.has(key))
			throw new Error(`Duplicate contraption block at ${key}`);
		sourceBlocks.set(key, block);
	}

	if (!sourceBlocks.has(locationKey(anchor)))
		throw new Error("The contraption anchor must be part of the assembled block set");

	const reached = new Set([locationKey(anchor)]);
	const pending = [{ ...anchor }];
	while (pending.length > 0) {
		const current = pending.shift();
		for (const [x, y, z] of NEIGHBOR_OFFSETS) {
			const adjacent = { x: current.x + x, y: current.y + y, z: current.z + z };
			const adjacentKey = locationKey(adjacent);
			if (sourceBlocks.has(adjacentKey) && !reached.has(adjacentKey)) {
				reached.add(adjacentKey);
				pending.push(adjacent);
			}
		}
	}

	if (reached.size !== sourceBlocks.size)
		throw new Error("Contraption blocks must form one face-connected component");

	return sealSnapshot({
		anchor: { ...anchor },
		blocks: [...sourceBlocks.values()]
			.map(block => ({
				typeId: block.typeId,
				relative: {
					x: block.location.x - anchor.x,
					y: block.location.y - anchor.y,
					z: block.location.z - anchor.z
				},
				...(block.states === undefined ? {} : { states: clone(block.states) }),
				...(block.data === undefined ? {} : { data: clone(block.data) })
			}))
			.sort((left, right) => locationKey(left.relative).localeCompare(locationKey(right.relative)))
	});
}

export function rotateSnapshotY(snapshot, quarterTurns) {
	const normalized = normalizeContraptionSnapshot(snapshot);
	return sealSnapshot({
		anchor: normalized.anchor,
		blocks: snapshot.blocks.map(block => ({
			...block,
			relative: rotateY(block.relative, quarterTurns),
			states: rotateStatesY(block.states, quarterTurns),
			...(block.data === undefined ? {} : { data: clone(block.data) })
		}))
	});
}

export function materializeSnapshot(snapshot, origin) {
	validateLocation(origin, "Contraption origin");
	const normalized = normalizeContraptionSnapshot(snapshot);
	return normalized.blocks.map(block => ({
		location: {
			x: origin.x + block.relative.x,
			y: origin.y + block.relative.y,
			z: origin.z + block.relative.z
		},
		typeId: block.typeId,
		states: clone(block.states),
		data: clone(block.data)
	}));
}
