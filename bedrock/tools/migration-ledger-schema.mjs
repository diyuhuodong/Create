import { JAVA_REGISTRATION_KINDS } from "./java-registration-catalog-schema.mjs";

export const MIGRATION_LEDGER_SCHEMA_VERSION = 1;
export const MIGRATION_OVERRIDE_SCHEMA_VERSION = 1;

export const LEDGER_STATUSES = new Set([
	"deferred_compat",
	"equivalent",
	"implemented",
	"missing",
	"not_applicable",
	"partial",
	"platform_blocked",
	"platform_verified",
	"unclassified"
]);

export const LEDGER_EVIDENCE_STATUSES = new Set([
	"missing",
	"not_required",
	"partial",
	"unreviewed",
	"verified"
]);

export const LEDGER_MAPPING_RELATIONS = new Set([
	"external_compat",
	"many_to_one_stateful",
	"not_applicable",
	"one_to_many_composite",
	"one_to_one",
	"unmapped",
	"virtualized"
]);

function isIdentifier(value) {
	return typeof value === "string" && /^[a-z0-9._-]+:[a-z0-9_./-]+$/.test(value);
}

function isNonEmptyString(value) {
	return typeof value === "string" && value.length > 0;
}

function expectedSourceKey(entry) {
	return `${entry.kind}:${entry.javaIdentifier}`;
}

function sameSummary(left, right) {
	const keys = new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})]);
	return [...keys].every(key => left?.[key] === right?.[key]);
}

/**
 * Validate the small, hand-maintained layer that records reviewed mappings.
 * The registration catalog remains the authority for scope; an override may
 * only classify a catalog record and cannot add a synthetic registration.
 */
export function validateMigrationOverrides(overrides, catalog) {
	if (!overrides || typeof overrides !== "object" || Array.isArray(overrides))
		throw new TypeError("Migration overrides must be an object");
	if (overrides.schemaVersion !== MIGRATION_OVERRIDE_SCHEMA_VERSION)
		throw new Error(`Migration overrides must use schema ${MIGRATION_OVERRIDE_SCHEMA_VERSION}`);
	if (!Array.isArray(overrides.entries))
		throw new Error("Migration overrides must contain an entries array");
	const catalogEntries = new Set(catalog?.entries?.map(entry => entry.sourceKey));
	const seen = new Set();
	for (const entry of overrides.entries) {
		if (!entry || typeof entry !== "object" || Array.isArray(entry))
			throw new Error("Migration override entries must be objects");
		if (!isNonEmptyString(entry.sourceKey) || !catalogEntries.has(entry.sourceKey))
			throw new Error(`Migration override ${entry.sourceKey} is not in the Java registration catalog`);
		if (seen.has(entry.sourceKey))
			throw new Error(`Migration overrides contain duplicate ${entry.sourceKey}`);
		seen.add(entry.sourceKey);
		if (!isNonEmptyString(entry.family) || !LEDGER_STATUSES.has(entry.status))
			throw new Error(`Migration override ${entry.sourceKey} has an invalid family or status`);
		for (const field of ["acquisition", "behavior", "resources"]) {
			if (!LEDGER_EVIDENCE_STATUSES.has(entry[field]))
				throw new Error(`Migration override ${entry.sourceKey} has invalid ${field} evidence`);
		}
		if (!entry.mapping || !LEDGER_MAPPING_RELATIONS.has(entry.mapping.relation) || !Array.isArray(entry.mapping.targets))
			throw new Error(`Migration override ${entry.sourceKey} has an invalid mapping`);
		if (!entry.mapping.targets.every(isIdentifier) || new Set(entry.mapping.targets).size !== entry.mapping.targets.length)
			throw new Error(`Migration override ${entry.sourceKey} has invalid mapping targets`);
		if (entry.mapping.relation === "unmapped" && entry.mapping.targets.length !== 0)
			throw new Error(`Unmapped migration override ${entry.sourceKey} cannot have targets`);
		if (entry.mapping.relation !== "unmapped" && entry.mapping.targets.length === 0)
			throw new Error(`Mapped migration override ${entry.sourceKey} requires targets`);
	}
	return { entries: overrides.entries.length };
}

export function validateMigrationLedger(ledger, catalog, domainInventory) {
	if (!ledger || typeof ledger !== "object" || Array.isArray(ledger))
		throw new TypeError("Migration ledger must be an object");
	if (ledger.schemaVersion !== MIGRATION_LEDGER_SCHEMA_VERSION)
		throw new Error(`Migration ledger must use schema ${MIGRATION_LEDGER_SCHEMA_VERSION}`);
	if (!Array.isArray(ledger.registrationEntries) || ledger.registrationEntries.length === 0)
		throw new Error("Migration ledger must contain registration entries");
	if (!catalog?.summary || !Array.isArray(catalog.entries))
		throw new TypeError("Migration ledger validation requires a Java registration catalog");
	if (!domainInventory?.summary || !Array.isArray(domainInventory.domains))
		throw new TypeError("Migration ledger validation requires a domain inventory");

	const catalogEntries = new Map(catalog.entries.map(entry => [entry.sourceKey, entry]));
	const ledgerEntries = new Map();
	for (const entry of ledger.registrationEntries) {
		if (!entry || typeof entry !== "object" || Array.isArray(entry))
			throw new Error("Migration ledger entries must be objects");
		if (!JAVA_REGISTRATION_KINDS.has(entry.kind) || !isIdentifier(entry.javaIdentifier))
			throw new Error("Migration ledger entries require a known kind and Java identifier");
		if (entry.sourceKey !== expectedSourceKey(entry))
			throw new Error(`Migration ledger entry ${entry.javaIdentifier} has an invalid source key`);
		if (!isNonEmptyString(entry.family))
			throw new Error(`Migration ledger entry ${entry.javaIdentifier} requires a family`);
		if (!LEDGER_STATUSES.has(entry.status))
			throw new Error(`Migration ledger entry ${entry.javaIdentifier} has an invalid status`);
		for (const field of ["acquisition", "behavior", "resources"]) {
			if (!LEDGER_EVIDENCE_STATUSES.has(entry[field]))
				throw new Error(`Migration ledger entry ${entry.javaIdentifier} has invalid ${field} evidence`);
		}
		if (!entry.mapping || !LEDGER_MAPPING_RELATIONS.has(entry.mapping.relation) || !Array.isArray(entry.mapping.targets))
			throw new Error(`Migration ledger entry ${entry.javaIdentifier} has an invalid mapping`);
		if (!entry.mapping.targets.every(isIdentifier) || new Set(entry.mapping.targets).size !== entry.mapping.targets.length)
			throw new Error(`Migration ledger entry ${entry.javaIdentifier} has invalid mapping targets`);
		if (!Array.isArray(entry.candidateTargets) || !entry.candidateTargets.every(isIdentifier) || new Set(entry.candidateTargets).size !== entry.candidateTargets.length)
			throw new Error(`Migration ledger entry ${entry.javaIdentifier} has invalid candidates`);
		if (entry.mapping.relation === "unmapped" && entry.mapping.targets.length !== 0)
			throw new Error(`Unmapped ledger entry ${entry.javaIdentifier} cannot have targets`);
		if (entry.mapping.relation !== "unmapped" && entry.mapping.targets.length === 0)
			throw new Error(`Mapped ledger entry ${entry.javaIdentifier} requires targets`);
		if (entry.status === "platform_verified" && [entry.acquisition, entry.behavior, entry.resources].some(status => status !== "verified" && status !== "not_required"))
			throw new Error(`Platform-verified ledger entry ${entry.javaIdentifier} requires static evidence`);
		if (!catalogEntries.has(entry.sourceKey))
			throw new Error(`Migration ledger entry ${entry.sourceKey} is not in the Java catalog`);
		if (ledgerEntries.has(entry.sourceKey))
			throw new Error(`Migration ledger contains duplicate ${entry.sourceKey}`);
		ledgerEntries.set(entry.sourceKey, entry);
	}
	for (const sourceKey of catalogEntries.keys()) {
		if (!ledgerEntries.has(sourceKey))
			throw new Error(`Migration ledger is missing Java catalog entry ${sourceKey}`);
	}
	if (ledger.registrationEntries.length !== catalog.entries.length)
		throw new Error("Migration ledger registration count does not match Java catalog");
	if (!ledger.domainInventory || ledger.domainInventory.path !== "bedrock/data/domain-inventory.json"
		|| ledger.domainInventory.total !== domainInventory.domains.reduce((total, domain) => total + domain.entries.length, 0)
		|| !sameSummary(ledger.domainInventory.summary, domainInventory.summary))
		throw new Error("Migration ledger domain inventory summary does not match source inventory");
	return { domains: ledger.domainInventory.total, registrations: ledger.registrationEntries.length };
}
