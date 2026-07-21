export const JAVA_REGISTRATION_CATALOG_SCHEMA_VERSION = 1;

export const JAVA_REGISTRATION_KINDS = new Set([
	"block",
	"block_entity",
	"entity",
	"fluid",
	"item"
]);

const KIND_ORDER = ["block", "item", "fluid", "block_entity", "entity"];

function isIdentifier(value) {
	return typeof value === "string" && /^create:[a-z0-9_./-]+$/.test(value);
}

function isNonEmptyString(value) {
	return typeof value === "string" && value.length > 0;
}

function expectedSourceKey(entry) {
	return `${entry.kind}:${entry.javaIdentifier}`;
}

export function catalogSummary(entries) {
	const summary = Object.fromEntries(KIND_ORDER.map(kind => [kind, 0]));
	for (const entry of entries)
		summary[entry.kind]++;
	return { ...summary, total: entries.length };
}

export function validateJavaRegistrationCatalog(catalog) {
	if (!catalog || typeof catalog !== "object" || Array.isArray(catalog))
		throw new TypeError("Java registration catalog must be an object");
	if (catalog.schemaVersion !== JAVA_REGISTRATION_CATALOG_SCHEMA_VERSION)
		throw new Error(`Java registration catalog must use schema ${JAVA_REGISTRATION_CATALOG_SCHEMA_VERSION}`);
	if (!isNonEmptyString(catalog.generatedFrom) || !isNonEmptyString(catalog.generatedAt))
		throw new Error("Java registration catalog requires generatedFrom and generatedAt");
	if (!Array.isArray(catalog.entries) || catalog.entries.length === 0)
		throw new Error("Java registration catalog must contain entries");

	const sourceKeys = new Set();
	for (const entry of catalog.entries) {
		if (!entry || typeof entry !== "object" || Array.isArray(entry))
			throw new Error("Java registration catalog entries must be objects");
		if (!JAVA_REGISTRATION_KINDS.has(entry.kind))
			throw new Error(`Java registration catalog entry ${entry.javaIdentifier} has an unknown kind`);
		if (!isIdentifier(entry.javaIdentifier))
			throw new Error("Java registration catalog entries require create namespace identifiers");
		if (entry.sourceKey !== expectedSourceKey(entry))
			throw new Error(`Java registration catalog entry ${entry.javaIdentifier} has an invalid source key`);
		if (!Array.isArray(entry.sources) || entry.sources.length === 0 || !entry.sources.every(isNonEmptyString))
			throw new Error(`Java registration catalog entry ${entry.javaIdentifier} requires source paths`);
		if (!Array.isArray(entry.registrationKinds) || entry.registrationKinds.length === 0 || !entry.registrationKinds.every(isNonEmptyString))
			throw new Error(`Java registration catalog entry ${entry.javaIdentifier} requires registration kinds`);
		if (new Set(entry.sources).size !== entry.sources.length || new Set(entry.registrationKinds).size !== entry.registrationKinds.length)
			throw new Error(`Java registration catalog entry ${entry.javaIdentifier} has duplicate provenance`);
		if (sourceKeys.has(entry.sourceKey))
			throw new Error(`Java registration catalog contains duplicate ${entry.sourceKey}`);
		sourceKeys.add(entry.sourceKey);
	}

	const expectedSummary = catalogSummary(catalog.entries);
	if (!catalog.summary || Object.keys(expectedSummary).some(key => catalog.summary[key] !== expectedSummary[key]))
		throw new Error("Java registration catalog summary does not match entries");
	return { entries: catalog.entries.length, summary: expectedSummary };
}
