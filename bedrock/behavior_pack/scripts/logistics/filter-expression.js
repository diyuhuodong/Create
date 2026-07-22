export const FILTER_EXPRESSION_SCHEMA = 1;
const MODES = new Set(["allow", "deny"]);

function text(value, label, maximum = 128) {
	if (typeof value !== "string" || value.length === 0 || value.length > maximum)
		throw new TypeError(`${label} must be non-empty bounded text`);
	return value;
}

export function createFilterExpression({ mode = "allow", packages = [], tags = [], typeIds = [], ...patch } = {}) {
	if (!MODES.has(mode))
		throw new TypeError("Filter expressions require allow or deny mode");
	for (const [label, values] of [["package addresses", packages], ["item tags", tags], ["item identifiers", typeIds]])
		if (!Array.isArray(values) || values.some(value => typeof value !== "string" || value.length > 128))
			throw new TypeError(`Filter ${label} must be bounded strings`);
	return {
		...patch,
		mode,
		packages: [...new Set(packages.map(value => value.trim()))].filter(Boolean).sort(),
		schemaVersion: FILTER_EXPRESSION_SCHEMA,
		tags: [...new Set(tags)].sort(),
		typeIds: [...new Set(typeIds)].sort()
	};
}

export function filterExpressionMatches(expression, { packageAddress = "", stack, tagsFor = () => [] } = {}) {
	const filter = createFilterExpression(expression);
	if (typeof tagsFor !== "function")
		throw new TypeError("Filter expressions require a tag resolver");
	const typeId = stack?.typeId;
	if (typeId !== undefined)
		text(typeId, "Filter stack identifier");
	const packageMatch = filter.packages.length === 0 || filter.packages.includes(packageAddress);
	const typeMatch = filter.typeIds.length === 0 || filter.typeIds.includes(typeId);
	const tagMatch = filter.tags.length === 0 || filter.tags.some(tag => tagsFor(tag).includes(typeId));
	const matches = packageMatch && typeMatch && tagMatch;
	const hasCriteria = filter.packages.length > 0 || filter.tags.length > 0 || filter.typeIds.length > 0;
	return filter.mode === "allow" ? matches : !hasCriteria || !matches;
}
