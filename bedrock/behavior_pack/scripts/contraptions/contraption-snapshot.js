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

function validateLocation(location, label) {
	if (!Number.isInteger(location?.x) || !Number.isInteger(location?.y) || !Number.isInteger(location?.z))
		throw new TypeError(`${label} must use integer block coordinates`);
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

	return {
		schemaVersion: 1,
		anchor: { ...anchor },
		blocks: [...sourceBlocks.values()]
			.map(block => ({
				typeId: block.typeId,
				relative: {
					x: block.location.x - anchor.x,
					y: block.location.y - anchor.y,
					z: block.location.z - anchor.z
				},
				states: clone(block.states),
				data: clone(block.data)
			}))
			.sort((left, right) => locationKey(left.relative).localeCompare(locationKey(right.relative)))
	};
}

export function rotateSnapshotY(snapshot, quarterTurns) {
	if (snapshot?.schemaVersion !== 1 || !Array.isArray(snapshot.blocks))
		throw new TypeError("Unsupported contraption snapshot");

	return {
		...snapshot,
		blocks: snapshot.blocks.map(block => ({
			...block,
			relative: rotateY(block.relative, quarterTurns),
			states: clone(block.states),
			data: clone(block.data)
		}))
	};
}

export function materializeSnapshot(snapshot, origin) {
	validateLocation(origin, "Contraption origin");
	if (snapshot?.schemaVersion !== 1 || !Array.isArray(snapshot.blocks))
		throw new TypeError("Unsupported contraption snapshot");

	return snapshot.blocks.map(block => ({
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
