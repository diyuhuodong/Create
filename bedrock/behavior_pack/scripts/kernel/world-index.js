export function worldLocationKey(dimensionId, location) {
	if (typeof dimensionId !== "string" || dimensionId.length === 0)
		throw new TypeError("World index entries require a dimension id");
	if (!Number.isInteger(location?.x) || !Number.isInteger(location?.y) || !Number.isInteger(location?.z))
		throw new TypeError("World index entries require integer block coordinates");
	return `${dimensionId}:${location.x}:${location.y}:${location.z}`;
}

export class WorldIndex {
	#entries = new Map();

	set(dimensionId, location, value) {
		const key = worldLocationKey(dimensionId, location);
		this.#entries.set(key, { dimensionId, key, location: { ...location }, value });
		return value;
	}

	get(dimensionId, location) {
		return this.#entries.get(worldLocationKey(dimensionId, location))?.value;
	}

	has(dimensionId, location) {
		return this.#entries.has(worldLocationKey(dimensionId, location));
	}

	delete(dimensionId, location) {
		return this.#entries.delete(worldLocationKey(dimensionId, location));
	}

	clear() {
		this.#entries.clear();
	}

	values() {
		return [...this.#entries.values()].map(entry => entry.value).values();
	}

	entriesInDimension(dimensionId) {
		return [...this.#entries.values()]
			.filter(entry => entry.dimensionId === dimensionId)
			.map(entry => ({ key: entry.key, location: { ...entry.location }, value: entry.value }));
	}

	countsByDimension() {
		const counts = {};
		for (const entry of this.#entries.values())
			counts[entry.dimensionId] = (counts[entry.dimensionId] ?? 0) + 1;
		return counts;
	}

	get size() {
		return this.#entries.size;
	}
}
