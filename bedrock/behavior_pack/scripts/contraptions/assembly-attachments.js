const attachmentProviders = new Map();

function assertLocation(location, label) {
	if (![location?.x, location?.y, location?.z].every(Number.isInteger))
		throw new TypeError(`Assembly ${label} must use integer coordinates`);
	return { x: location.x, y: location.y, z: location.z };
}

function locationKey(location) {
	return `${location.x}:${location.y}:${location.z}`;
}

function assertProviderId(id) {
	if (typeof id !== "string" || !/^[a-z][a-z0-9_]*$/.test(id))
		throw new TypeError("Assembly attachment provider ids must be lowercase identifiers");
	return id;
}

/**
 * Register an optional attachment edge source. Providers are deliberately
 * one-way extensions of the P4.1 collector: later packages such as Sticker
 * may contribute edges without P4.1 importing their runtime modules.
 */
export function registerAssemblyAttachmentProvider(id, provider) {
	id = assertProviderId(id);
	if (typeof provider !== "function")
		throw new TypeError("Assembly attachment providers must be functions");
	if (attachmentProviders.has(id))
		throw new Error(`Assembly attachment provider ${id} is already registered`);
	attachmentProviders.set(id, provider);
	return () => attachmentProviders.delete(id);
}

export function assemblyAttachmentProviderIds() {
	return [...attachmentProviders.keys()].sort();
}

/** Merge attachment edges deterministically and discard self-edges. The
 * traversal itself owns longer-cycle detection through its visited set. */
export function mergeAssemblyAttachmentLocations(source, ...groups) {
	source = assertLocation(source, "source location");
	const sourceKey = locationKey(source);
	const merged = new Map();
	for (const group of groups) {
		if (!Array.isArray(group))
			throw new TypeError("Assembly attachment groups must be arrays");
		for (const location of group) {
			const candidate = assertLocation(location, "attachment location");
			const key = locationKey(candidate);
			if (key !== sourceKey)
				merged.set(key, candidate);
		}
	}
	return [...merged.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, location]) => location);
}

/** Single deterministic edge provider for every dynamic assembly collector. */
export function linkedLocationsForAssembly(dimensionId, location) {
	const groups = [...attachmentProviders.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([, provider]) => provider(dimensionId, location));
	return mergeAssemblyAttachmentLocations(location, ...groups);
}
