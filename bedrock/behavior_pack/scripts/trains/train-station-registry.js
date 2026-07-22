export const TRAIN_STATION_SCHEMA_VERSION = 1;

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function boundedString(value, label, maximum = 128) {
	if (typeof value !== "string" || value.length === 0 || value.length > maximum)
		throw new TypeError(`${label} must be a non-empty bounded string`);
	return value;
}

function location(value) {
	if (![value?.x, value?.y, value?.z].every(Number.isInteger))
		throw new TypeError("Train stations require integer block locations");
	return { x: value.x, y: value.y, z: value.z };
}

export function normalizeTrainStation(value) {
	if (!value || value.schemaVersion !== TRAIN_STATION_SCHEMA_VERSION || !Number.isInteger(value.revision) || value.revision < 0)
		throw new TypeError(`Train stations must use schema ${TRAIN_STATION_SCHEMA_VERSION} with a revision`);
	return {
		dimensionId: boundedString(value.dimensionId, "Train station dimension"),
		id: boundedString(value.id, "Train station id"),
		location: location(value.location),
		name: boundedString(value.name, "Train station name", 64),
		nodeId: boundedString(value.nodeId, "Train station node"),
		platformSide: value.platformSide === "left" || value.platformSide === "right" ? value.platformSide : undefined,
		powered: !!value.powered,
		revision: value.revision,
		schemaVersion: TRAIN_STATION_SCHEMA_VERSION
	};
}

function patternMatcher(filter) {
	const escaped = filter.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
	return new RegExp(`^${escaped}$`, "i");
}

export class TrainStationRegistry {
	#dimensionId;
	#stations = new Map();

	constructor(dimensionId) {
		this.#dimensionId = boundedString(dimensionId, "Train station registry dimension");
	}

	upsert(value, expectedRevision = undefined) {
		const current = this.#stations.get(value.id);
		if (expectedRevision !== undefined && current?.revision !== expectedRevision)
			return { ok: false, reason: "revision_conflict", station: current && clone(current) };
		const candidate = normalizeTrainStation({
			...current,
			...value,
			dimensionId: this.#dimensionId,
			revision: current?.revision ?? 0,
			schemaVersion: TRAIN_STATION_SCHEMA_VERSION
		});
		if (current && JSON.stringify(candidate) === JSON.stringify(current))
			return { changed: false, ok: true, station: clone(current) };
		const station = { ...candidate, revision: current ? current.revision + 1 : 0 };
		for (const candidate of this.#stations.values())
			if (candidate.id !== station.id && candidate.name.toLocaleLowerCase() === station.name.toLocaleLowerCase())
				return { ok: false, reason: "duplicate_name", station: clone(candidate) };
		this.#stations.set(station.id, station);
		return { changed: true, ok: true, station: clone(station) };
	}

	remove(id, expectedRevision = undefined) {
		const current = this.#stations.get(id);
		if (!current)
			return false;
		if (expectedRevision !== undefined && current.revision !== expectedRevision)
			return false;
		return this.#stations.delete(id);
	}

	get(id) {
		const value = this.#stations.get(id);
		return value && clone(value);
	}

	findByNode(nodeId) {
		const value = [...this.#stations.values()].find(station => station.nodeId === nodeId);
		return value && clone(value);
	}

	resolve(filter, exact = false) {
		boundedString(filter, "Train station filter");
		const normalized = filter.toLocaleLowerCase();
		const matcher = patternMatcher(filter);
		const matches = [...this.#stations.values()].filter(station => exact
			? [station.id, station.name, station.nodeId].some(value => value.toLocaleLowerCase() === normalized)
			: matcher.test(station.name) || matcher.test(station.id) || station.name.toLocaleLowerCase().includes(normalized));
		return matches.sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))[0]?.nodeId;
	}

	snapshot() {
		return [...this.#stations.values()].map(clone).sort((left, right) => left.id.localeCompare(right.id));
	}

	restore(records) {
		if (!Array.isArray(records))
			throw new TypeError("Train station restore requires an array");
		const restored = records.map(normalizeTrainStation);
		if (restored.some(station => station.dimensionId !== this.#dimensionId) || new Set(restored.map(station => station.id)).size !== restored.length
			|| new Set(restored.map(station => station.name.toLocaleLowerCase())).size !== restored.length)
			throw new TypeError("Train station snapshot has duplicate or cross-dimension records");
		this.#stations = new Map(restored.map(station => [station.id, station]));
	}
}
