const NEIGHBOR_OFFSETS = [
	[1, 0, 0],
	[-1, 0, 0],
	[0, 1, 0],
	[0, -1, 0],
	[0, 0, 1],
	[0, 0, -1]
];

function keyFor(location) {
	return `${location.x}:${location.y}:${location.z}`;
}

export function collectConnectedBlocks({ start, readBlock, maxBlocks = 16, canCollect = () => true }) {
	if (typeof readBlock !== "function")
		throw new TypeError("Contraption collection requires readBlock()");
	if (!Number.isInteger(maxBlocks) || maxBlocks < 1)
		throw new RangeError("Contraption collection requires a positive block limit");

	const first = readBlock(start);
	if (!first || !canCollect(first))
		return [];

	const blocks = [];
	const visited = new Set([keyFor(start)]);
	const pending = [{ ...start }];
	while (pending.length > 0) {
		const location = pending.shift();
		const block = readBlock(location);
		if (!block || !canCollect(block))
			continue;

		blocks.push({ ...block, location: { ...location } });
		if (blocks.length > maxBlocks)
			throw new RangeError(`Contraption exceeds the ${maxBlocks} block prototype limit`);

		for (const [x, y, z] of NEIGHBOR_OFFSETS) {
			const adjacent = { x: location.x + x, y: location.y + y, z: location.z + z };
			const key = keyFor(adjacent);
			if (!visited.has(key)) {
				visited.add(key);
				pending.push(adjacent);
			}
		}
	}

	return blocks;
}
