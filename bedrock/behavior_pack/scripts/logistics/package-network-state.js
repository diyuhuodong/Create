import { createFilterExpression, filterExpressionMatches } from "./filter-expression.js";

export const PACKAGE_ENDPOINT_SCHEMA = 1;
const DELIVERY_KINDS = new Set(["frogport", "postbox", "packager_link"]);

export function createPackageEndpoint({ address = "", capacity = 8, connected = true, enabled = true, filter, revision = 0, ...record } = {}) {
	if (typeof record.id !== "string" || record.id.length === 0 || typeof record.kind !== "string" || record.kind.length === 0)
		throw new TypeError("Package endpoints require stable identifiers and kinds");
	if (typeof address !== "string" || address.length > 64)
		throw new TypeError("Package endpoint addresses must be at most 64 characters");
	if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 64)
		throw new RangeError("Package endpoint capacities must be from one through 64");
	if (!Number.isSafeInteger(revision) || revision < 0 || typeof connected !== "boolean" || typeof enabled !== "boolean")
		throw new TypeError("Package endpoint state is invalid");
	return {
		...record,
		address: address.trim(),
		capacity,
		connected,
		enabled,
		filter: createFilterExpression(filter),
		revision,
		schemaVersion: PACKAGE_ENDPOINT_SCHEMA
	};
}

export function packageEndpointAccepts(endpoint, packageRecord, { occupied = 0 } = {}) {
	const candidate = createPackageEndpoint(endpoint);
	if (!candidate.enabled || !candidate.connected || !DELIVERY_KINDS.has(candidate.kind) || candidate.id === packageRecord?.owner?.id)
		return false;
	if (candidate.address !== packageRecord.address || !Number.isSafeInteger(occupied) || occupied < 0 || occupied >= candidate.capacity)
		return false;
	const contents = packageRecord.contents ?? [];
	if (!Array.isArray(contents))
		throw new TypeError("Package contents must be an array");
	return contents.every(stack => filterExpressionMatches(candidate.filter, {
		packageAddress: packageRecord.address,
		stack,
		tagsFor: tag => stack.tags?.includes(tag) ? [stack.typeId] : []
	}));
}

export function routePackage({ endpoints, packageRecord }) {
	if (!packageRecord || typeof packageRecord.id !== "string" || typeof packageRecord.address !== "string" || !packageRecord.owner)
		throw new TypeError("Package routing requires a ledger package record");
	if (!Array.isArray(endpoints))
		throw new TypeError("Package routing requires endpoint records");
	return endpoints
		.filter(endpoint => packageEndpointAccepts(endpoint, packageRecord, { occupied: endpoint.occupied ?? 0 }))
		.sort((left, right) => left.id.localeCompare(right.id))[0];
}

export function packageFilterMatches(filter, packageRecord) {
	if (typeof filter !== "string" || !packageRecord || typeof packageRecord.address !== "string")
		throw new TypeError("Package filters require a string and package record");
	return filter.length === 0 || packageRecord.address === filter;
}
