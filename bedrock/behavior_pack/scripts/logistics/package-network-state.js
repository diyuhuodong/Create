export function routePackage({ endpoints, packageRecord }) {
	if (!packageRecord || typeof packageRecord.id !== "string" || typeof packageRecord.address !== "string" || !packageRecord.owner)
		throw new TypeError("Package routing requires a ledger package record");
	if (!Array.isArray(endpoints))
		throw new TypeError("Package routing requires endpoint records");
	return endpoints
		.filter(endpoint => endpoint?.enabled !== false && typeof endpoint.id === "string" && endpoint.address === packageRecord.address && endpoint.id !== packageRecord.owner.id)
		.filter(endpoint => ["frogport", "postbox", "packager_link"].includes(endpoint.kind))
		.sort((left, right) => left.id.localeCompare(right.id))[0];
}

export function packageFilterMatches(filter, packageRecord) {
	if (typeof filter !== "string" || !packageRecord || typeof packageRecord.address !== "string")
		throw new TypeError("Package filters require a string and package record");
	return filter.length === 0 || packageRecord.address === filter;
}
