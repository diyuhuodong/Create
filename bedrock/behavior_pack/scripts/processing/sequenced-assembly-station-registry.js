const resolvers = new Map();

function assertResolverId(id) {
	if (typeof id !== "string" || id.length === 0)
		throw new TypeError("Sequenced-assembly station resolvers require an identifier");
	return id;
}

/** Register a deterministic world-station resolver for Belt carrier positions. */
export function registerSequencedAssemblyStationResolver(id, resolve) {
	assertResolverId(id);
	if (typeof resolve !== "function")
		throw new TypeError("Sequenced-assembly station resolvers require a function");
	if (resolvers.has(id))
		return false;
	resolvers.set(id, resolve);
	return true;
}

export function stationForSequencedBeltCarrier(carrier) {
	for (const [id, resolve] of [...resolvers.entries()].sort(([left], [right]) => left.localeCompare(right))) {
		const station = resolve(carrier);
		if (!station)
			continue;
		if (typeof station.id !== "string" || station.id.length === 0 || typeof station.stationType !== "string" || station.stationType.length === 0)
			throw new TypeError(`Sequenced-assembly station resolver ${id} returned an invalid station`);
		return station;
	}
	return undefined;
}

export function sequencedAssemblyStationResolverIds() {
	return [...resolvers.keys()].sort();
}
