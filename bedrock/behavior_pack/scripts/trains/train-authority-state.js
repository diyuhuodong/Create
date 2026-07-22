export const TRAIN_AUTHORITY_SCHEMA_VERSION = 3;
export const TRAIN_AUTHORITY_READABLE_SCHEMAS = Object.freeze([2, TRAIN_AUTHORITY_SCHEMA_VERSION]);

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function assertPositiveInteger(value, name) {
	if (!Number.isInteger(value) || value < 1)
		throw new TypeError(`${name} must be a positive integer`);
	return value;
}

function assertDimensionId(value) {
	if (typeof value !== "string" || value.length === 0)
		throw new TypeError("Train authority dimensions require a non-empty id");
	return value;
}

function assertRecordArray(value, name) {
	if (!Array.isArray(value))
		throw new TypeError(`${name} must be an array`);
	return clone(value);
}

export function trainAuthorityPartition(record) {
	if (record?.kind === "train_authority_meta")
		return "meta";
	if (record?.kind === "train_authority_dimension")
		return `dimension:${assertDimensionId(record.dimensionId)}`;
	throw new TypeError("Unknown train authority record kind");
}

export function createTrainAuthorityRecords({ dimensions, nextTrainId, portalTransfers = [] }) {
	assertPositiveInteger(nextTrainId, "Train authority next id");
	if (!Array.isArray(dimensions))
		throw new TypeError("Train authority dimensions must be an array");
	const ids = new Set();
	const records = [{
		kind: "train_authority_meta",
		nextTrainId,
		portalTransfers: assertRecordArray(portalTransfers, "Train authority Portal transfers"),
		schemaVersion: TRAIN_AUTHORITY_SCHEMA_VERSION
	}];
	for (const dimension of dimensions) {
		const dimensionId = assertDimensionId(dimension?.dimensionId);
		if (ids.has(dimensionId))
			throw new TypeError(`Duplicate train authority dimension ${dimensionId}`);
		ids.add(dimensionId);
		if (!dimension.graph || typeof dimension.graph !== "object" || Array.isArray(dimension.graph))
			throw new TypeError(`Train authority graph for ${dimensionId} must be an object`);
		records.push({
			dimensionId,
			graph: clone(dimension.graph),
			kind: "train_authority_dimension",
			schemaVersion: TRAIN_AUTHORITY_SCHEMA_VERSION,
			stations: assertRecordArray(dimension.stations ?? [], `Train authority stations for ${dimensionId}`),
			trains: assertRecordArray(dimension.trains, `Train authority trains for ${dimensionId}`)
		});
	}
	return records;
}

export function readTrainAuthorityRecords(records) {
	if (!Array.isArray(records))
		throw new TypeError("Train authority records must be an array");
	let nextTrainId;
	let portalTransfers = [];
	let storedSchema;
	const dimensions = [];
	const ids = new Set();
	for (const record of records) {
		if (!TRAIN_AUTHORITY_READABLE_SCHEMAS.includes(record?.schemaVersion))
			throw new TypeError("Unsupported train authority record schema");
		storedSchema ??= record.schemaVersion;
		if (storedSchema !== record.schemaVersion)
			throw new TypeError("Train authority storage mixes record schemas");
		if (record.kind === "train_authority_meta") {
			if (nextTrainId !== undefined)
				throw new TypeError("Train authority storage contains duplicate meta records");
			nextTrainId = assertPositiveInteger(record.nextTrainId, "Train authority next id");
			portalTransfers = record.schemaVersion >= 3 ? assertRecordArray(record.portalTransfers ?? [], "Train authority Portal transfers") : [];
			continue;
		}
		if (record.kind !== "train_authority_dimension")
			throw new TypeError("Unknown train authority record kind");
		const dimensionId = assertDimensionId(record.dimensionId);
		if (ids.has(dimensionId))
			throw new TypeError(`Duplicate train authority dimension ${dimensionId}`);
		ids.add(dimensionId);
		if (!record.graph || typeof record.graph !== "object" || Array.isArray(record.graph))
			throw new TypeError(`Train authority graph for ${dimensionId} must be an object`);
		dimensions.push({
			dimensionId,
			graph: clone(record.graph),
			stations: record.schemaVersion >= 3 ? assertRecordArray(record.stations ?? [], `Train authority stations for ${dimensionId}`) : [],
			trains: assertRecordArray(record.trains, `Train authority trains for ${dimensionId}`)
		});
	}
	if (nextTrainId === undefined)
		throw new TypeError("Train authority storage is missing its meta record");
	return { dimensions: dimensions.sort((left, right) => left.dimensionId.localeCompare(right.dimensionId)), nextTrainId, portalTransfers };
}

export function migrateLegacyTrainSnapshot(snapshot) {
	if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot))
		throw new TypeError("Legacy train snapshot must be an object");
	return {
		dimensions: (snapshot.dimensions ?? []).map(dimension => ({
			dimensionId: dimension?.dimensionId,
			graph: dimension?.graph,
			stations: dimension?.stations ?? [],
			trains: dimension?.trains
		})),
		nextTrainId: snapshot.nextTrainId ?? 1,
		portalTransfers: snapshot.portalTransfers ?? []
	};
}
