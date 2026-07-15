export const DEFAULT_LOGISTICS_NETWORK = "default";

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

export function normalizeLogisticsNetworkId(value = DEFAULT_LOGISTICS_NETWORK) {
	if (typeof value !== "string")
		throw new TypeError("Logistics network IDs must be strings");
	const normalized = value.trim().toLowerCase();
	if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(normalized))
		throw new RangeError("Logistics network IDs must use 1 to 64 lowercase letters, digits, dots, hyphens, or underscores");
	return normalized;
}

export function normalizeLogisticsAddress(value = "") {
	if (typeof value !== "string")
		throw new TypeError("Logistics addresses must be strings");
	const normalized = value.trim().replaceAll(/\s+/g, " ");
	if (normalized.length > 64 || /[\u0000-\u001f\u007f]/.test(normalized))
		throw new RangeError("Logistics addresses must be printable text up to 64 characters");
	return normalized;
}

export function createLogisticsEndpoint(value = {}) {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new TypeError("Logistics endpoints must be objects");
	const revision = value.revision ?? 0;
	if (!Number.isInteger(revision) || revision < 0 || revision > Number.MAX_SAFE_INTEGER)
		throw new RangeError("Logistics endpoint revisions must be non-negative safe integers");
	if (value.acceptsRequests !== undefined && typeof value.acceptsRequests !== "boolean")
		throw new TypeError("Logistics endpoint request acceptance must be boolean");
	return Object.freeze({
		acceptsRequests: value.acceptsRequests !== false,
		address: normalizeLogisticsAddress(value.address),
		networkId: normalizeLogisticsNetworkId(value.networkId),
		revision
	});
}

export function updateLogisticsEndpoint(current, { expectedRevision, patch }) {
	const endpoint = createLogisticsEndpoint(current);
	if (!Number.isInteger(expectedRevision) || expectedRevision < 0)
		throw new RangeError("Logistics endpoint edits require a non-negative revision");
	if (expectedRevision !== endpoint.revision)
		return { changed: false, conflict: true, endpoint: clone(endpoint) };
	if (!patch || typeof patch !== "object" || Array.isArray(patch))
		throw new TypeError("Logistics endpoint edits require a patch object");
	const allowed = new Set(["acceptsRequests", "address", "networkId"]);
	for (const key of Object.keys(patch))
		if (!allowed.has(key))
			throw new Error(`Unknown logistics endpoint setting ${key}`);
	const next = createLogisticsEndpoint({ ...endpoint, ...patch, revision: endpoint.revision });
	if (next.acceptsRequests === endpoint.acceptsRequests && next.address === endpoint.address && next.networkId === endpoint.networkId)
		return { changed: false, conflict: false, endpoint: clone(endpoint) };
	return { changed: true, conflict: false, endpoint: { ...next, revision: endpoint.revision + 1 } };
}

/** An empty target address selects all accepting endpoints in a network. */
export function matchesLogisticsEndpoint(endpoint, { networkId = DEFAULT_LOGISTICS_NETWORK, targetAddress = "" } = {}) {
	const normalized = createLogisticsEndpoint(endpoint);
	return normalized.acceptsRequests
		&& normalized.networkId === normalizeLogisticsNetworkId(networkId)
		&& (normalizeLogisticsAddress(targetAddress) === "" || normalized.address === normalizeLogisticsAddress(targetAddress));
}
