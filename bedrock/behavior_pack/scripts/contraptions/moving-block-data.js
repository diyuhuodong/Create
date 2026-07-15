const adapters = new Map();

function clone(value) {
	return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function normalizeAdapter(adapter) {
	if (typeof adapter?.capture !== "function" || typeof adapter?.detach !== "function" || typeof adapter?.restore !== "function")
		throw new TypeError("Moving block data adapters require capture(), detach(), and restore()");
	if (adapter.schemaVersion === undefined)
		return { ...adapter, versioned: false };
	if (!Number.isInteger(adapter.schemaVersion) || adapter.schemaVersion < 1)
		throw new RangeError("Versioned moving block data adapters require a positive integer schema version");
	if (adapter.validate !== undefined && typeof adapter.validate !== "function")
		throw new TypeError("Moving block data adapter validators must be functions");
	return { ...adapter, versioned: true };
}

function capture(adapter, dimensionId, location) {
	const payload = adapter.capture(dimensionId, location);
	if (payload === undefined || !adapter.versioned)
		return payload;
	adapter.validate?.(payload);
	return { adapterSchemaVersion: adapter.schemaVersion, payload: clone(payload) };
}

function restore(adapter, dimensionId, location, data) {
	if (!adapter.versioned || data === undefined)
		return adapter.restore(dimensionId, location, data);
	const payload = data?.adapterSchemaVersion === undefined
		? data // v1 snapshot compatibility: pre-envelope assembly data
		: (() => {
			if (data.adapterSchemaVersion !== adapter.schemaVersion)
				throw new Error(`Moving block data schema ${data.adapterSchemaVersion} is incompatible with adapter schema ${adapter.schemaVersion}`);
			return data.payload;
		})();
	adapter.validate?.(payload);
	return adapter.restore(dimensionId, location, clone(payload));
}

function contributorMap(typeId) {
	let contributors = adapters.get(typeId);
	if (!contributors) {
		contributors = new Map();
		adapters.set(typeId, contributors);
	}
	return contributors;
}

function orderedContributors(typeId) {
	return [...(adapters.get(typeId) ?? new Map()).entries()].sort(([left], [right]) => left.localeCompare(right));
}

export function registerMovingBlockDataAdapter(typeId, adapter) {
	if (typeof typeId !== "string" || typeId.length === 0)
		throw new TypeError("Moving block data adapters require a non-empty block type identifier");
	contributorMap(typeId).set("default", normalizeAdapter(adapter));
}

/**
 * A block can participate in several authoritative domains (for example,
 * kinetic topology plus a processing machine). Contributors make that one
 * captured payload without letting either domain overwrite the other.
 */
export function registerMovingBlockDataContributor(typeId, name, adapter) {
	if (typeof typeId !== "string" || typeId.length === 0 || typeof name !== "string" || !/^[a-z][a-z0-9_-]{0,63}$/.test(name) || name === "default")
		throw new TypeError("Moving block data contributors require a block type and short non-default name");
	contributorMap(typeId).set(name, normalizeAdapter(adapter));
}

export function registerStatelessMovingBlockDataAdapter(typeId) {
	registerMovingBlockDataAdapter(typeId, {
		schemaVersion: 1,
		capture() {
			return undefined;
		},
		detach() {
			return undefined;
		},
		restore() {}
	});
}

export function hasMovingBlockDataAdapter(typeId) {
	return (adapters.get(typeId)?.size ?? 0) > 0;
}

export function captureMovingBlockData(typeId, dimensionId, location) {
	const contributors = orderedContributors(typeId);
	if (contributors.length === 0)
		return undefined;
	if (contributors.length === 1)
		return capture(contributors[0][1], dimensionId, location);
	const captured = {};
	for (const [name, adapter] of contributors) {
		const data = capture(adapter, dimensionId, location);
		if (data !== undefined)
			captured[name] = data;
	}
	return Object.keys(captured).length === 0 ? undefined : { assemblyDataSchema: 1, contributors: captured };
}

export function detachMovingBlockData(typeId, dimensionId, location) {
	let result;
	for (const [, adapter] of orderedContributors(typeId))
		result = adapter.detach(dimensionId, location);
	return result;
}

export function restoreMovingBlockData(typeId, dimensionId, location, data) {
	const contributors = orderedContributors(typeId);
	if (contributors.length === 0)
		return undefined;
	if (contributors.length === 1)
		return restore(contributors[0][1], dimensionId, location, data);
	if (data?.assemblyDataSchema === 1 && data.contributors && typeof data.contributors === "object" && !Array.isArray(data.contributors)) {
		let result;
		for (const [name, adapter] of contributors)
			if (data.contributors[name] !== undefined)
				result = restore(adapter, dimensionId, location, data.contributors[name]);
		return result;
	}
	// Before contributors existed, the original single adapter wrote raw data.
	// Keep that migration path narrow: only the primary/default domain receives it.
	const primary = adapters.get(typeId).get("default");
	return primary && restore(primary, dimensionId, location, data);
}
