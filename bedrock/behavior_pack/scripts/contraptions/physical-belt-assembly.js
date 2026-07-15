function assertLocation(location, label) {
	if (![location?.x, location?.y, location?.z].every(Number.isInteger))
		throw new TypeError(`${label} requires integer coordinates`);
	return { x: location.x, y: location.y, z: location.z };
}

function keyFor(location) {
	return `${location.x}:${location.y}:${location.z}`;
}

/**
 * A depot belt is one logistics route, not independent belt blocks.  An
 * assembly may carry it only when it owns the whole route and both endpoint
 * ports; an in-flight item must stay in its original durable route instead.
 */
export function capturePhysicalBeltAssemblyAttachments({ anchor, locations, runs }) {
	const normalizedAnchor = assertLocation(anchor, "Physical belt assembly anchor");
	if (!Array.isArray(locations) || !Array.isArray(runs))
		throw new TypeError("Physical belt assembly capture requires locations and runs");
	const included = new Set(locations.map(location => keyFor(assertLocation(location, "Physical belt assembly locations"))));
	const records = [];
	for (const run of runs) {
		if (typeof run?.id !== "string" || !Array.isArray(run.locations) || !run.sourceLocation || !run.destinationLocation)
			throw new TypeError("Physical belt runs require an ID, segments, and endpoint ports");
		const segments = run.locations.map(location => assertLocation(location, "Physical belt segment"));
		const intersects = segments.some(location => included.has(keyFor(location)));
		if (!intersects)
			continue;
		if (run.movable !== true)
			throw new Error(`Physical belt ${run.id} has an active item transport`);
		if (!segments.every(location => included.has(keyFor(location))))
			throw new Error(`Physical belt ${run.id} must move as one complete run`);
		const source = assertLocation(run.sourceLocation, "Physical belt source port");
		const destination = assertLocation(run.destinationLocation, "Physical belt destination port");
		if (!included.has(keyFor(source)) || !included.has(keyFor(destination)))
			throw new Error(`Physical belt ${run.id} must move with both endpoint ports`);
		records.push({
			locations: segments.map(location => ({
				x: location.x - normalizedAnchor.x,
				y: location.y - normalizedAnchor.y,
				z: location.z - normalizedAnchor.z
			})),
			name: run.id
		});
	}
	return records.sort((left, right) => left.name.localeCompare(right.name));
}
