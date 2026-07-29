import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const P8_INTEGRITY_BASELINE_SCHEMA_VERSION = 1;
export const P8_INTEGRITY_JAVA_BASELINE = "Create 6.0.11 / Minecraft Java 1.21.1";

export const P8_INTEGRITY_DOCUMENTS = Object.freeze([
	["acquisition", "data/p7-1-acquisition-ledger.json"],
	["behaviorInventory", "data/java-behavior-inventory.json"],
	["c4SemanticDifferences", "data/p8-c4-semantic-differences.json"],
	["domainConvergence", "data/p8-4-domain-convergence.json"],
	["domainInventory", "data/domain-inventory.json"],
	["gapLedger", "data/p7-7-gap-ledger.json"],
	["migrationLedger", "data/migration-ledger.json"],
	["parityEvidence", "data/p8-parity-evidence-ledger.json"],
	["registrationCatalog", "data/java-registration-catalog.json"]
]);

function assertObject(value, label) {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new TypeError(`P8 C0 integrity baseline ${label} must be an object`);
}

function canonical(value) {
	if (Array.isArray(value))
		return value.map(canonical);
	if (!value || typeof value !== "object")
		return value;
	return Object.fromEntries(Object.keys(value).sort((left, right) => left.localeCompare(right))
		.map(key => [key, canonical(value[key])]));
}

function digest(value) {
	return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function countBy(entries, field) {
	return Object.fromEntries([...new Set(entries.map(entry => String(entry[field])))].sort()
		.map(value => [value, entries.filter(entry => String(entry[field]) === value).length]));
}

function domainTotal(inventory) {
	return inventory.domains.reduce((total, domain) => total + domain.entries.length, 0);
}

function sourceDocument(id, path, document, counts) {
	if (!Number.isInteger(document.schemaVersion) || document.schemaVersion < 1)
		throw new Error(`P8 C0 ${id} requires a positive schema version`);
	if (document.generatedAt !== "deterministic")
		throw new Error(`P8 C0 ${id} is not deterministic`);
	return { counts, id, path, schemaVersion: document.schemaVersion, sha256: digest(document) };
}

export function validateP8IntegrityBaseline(document) {
	assertObject(document, "document");
	if (document.schemaVersion !== P8_INTEGRITY_BASELINE_SCHEMA_VERSION)
		throw new Error(`P8 C0 integrity baseline must use schema ${P8_INTEGRITY_BASELINE_SCHEMA_VERSION}`);
	if (document.generatedAt !== "deterministic" || document.javaBaseline !== P8_INTEGRITY_JAVA_BASELINE)
		throw new Error("P8 C0 integrity baseline has an invalid Java baseline");
	if (!Array.isArray(document.generatedFrom) || !Array.isArray(document.documents) || !Array.isArray(document.openResponsibilities))
		throw new TypeError("P8 C0 integrity baseline requires source, document, and responsibility arrays");
	const expectedPaths = P8_INTEGRITY_DOCUMENTS.map(([, path]) => path);
	if (JSON.stringify(document.generatedFrom) !== JSON.stringify(expectedPaths))
		throw new Error("P8 C0 integrity baseline source list is stale");
	const expectedIds = P8_INTEGRITY_DOCUMENTS.map(([id]) => id).sort();
	if (JSON.stringify(document.documents.map(entry => entry.id)) !== JSON.stringify(expectedIds))
		throw new Error("P8 C0 integrity baseline documents must be complete and sorted");
	for (const entry of document.documents) {
		assertObject(entry, `document ${entry?.id ?? "unknown"}`);
		if (!expectedPaths.includes(entry.path) || !/^[a-f0-9]{64}$/.test(entry.sha256) || !Number.isInteger(entry.schemaVersion))
			throw new Error(`P8 C0 integrity baseline document ${entry.id} is invalid`);
		assertObject(entry.counts, `document ${entry.id} counts`);
	}
	assertObject(document.authoritativeCounts, "authoritative counts");
	if (document.fingerprint !== digest({
		authoritativeCounts: document.authoritativeCounts,
		documents: document.documents,
		javaBaseline: document.javaBaseline,
		openResponsibilities: document.openResponsibilities
	}))
		throw new Error("P8 C0 integrity baseline fingerprint is stale");
	return {
		documents: document.documents.length,
		fingerprint: document.fingerprint,
		...document.authoritativeCounts
	};
}

export async function buildP8IntegrityBaseline({ bedrockRoot }) {
	const loaded = Object.fromEntries(await Promise.all(P8_INTEGRITY_DOCUMENTS.map(async ([id, path]) => [
		id,
		JSON.parse(await readFile(resolve(bedrockRoot, path), "utf8"))
	])));
	const {
		acquisition,
		behaviorInventory,
		c4SemanticDifferences,
		domainConvergence,
		domainInventory,
		gapLedger,
		migrationLedger,
		parityEvidence,
		registrationCatalog
	} = loaded;
	for (const [id, document] of Object.entries(loaded))
		assertObject(document, id);
	for (const [id, document] of Object.entries({ behaviorInventory, domainInventory, registrationCatalog }))
		if (typeof document.generatedFrom !== "string" || !document.generatedFrom.startsWith(P8_INTEGRITY_JAVA_BASELINE))
			throw new Error(`P8 C0 ${id} does not use the ${P8_INTEGRITY_JAVA_BASELINE} source baseline`);
	const authoritativeCounts = {
		behaviors: behaviorInventory.entries.length,
		domains: domainTotal(domainInventory),
		registrations: registrationCatalog.entries.length
	};
	if (migrationLedger.registrationEntries.length !== authoritativeCounts.registrations
		|| migrationLedger.domainEntries.length !== authoritativeCounts.domains)
		throw new Error("P8 C0 migration ledger does not match the authoritative Java inventories");
	const migrationDomains = new Map(migrationLedger.domainEntries.map(entry => [entry.sourceKey, entry]));
	if (domainConvergence.entries.length !== authoritativeCounts.domains || domainConvergence.entries.some(entry =>
		migrationDomains.get(entry.sourceKey)?.status !== entry.status
		|| JSON.stringify(migrationDomains.get(entry.sourceKey)?.convergence?.evidence) !== JSON.stringify(entry.evidence)))
		throw new Error("P8 C1 migration domains do not match P8.4 convergence");
	if (parityEvidence.summary.recordType.registration !== authoritativeCounts.registrations
		|| parityEvidence.summary.recordType.domain !== authoritativeCounts.domains
		|| parityEvidence.summary.recordType.behavior !== authoritativeCounts.behaviors)
		throw new Error("P8 C0 parity evidence does not match the authoritative Java inventories");
	if (gapLedger.sources.javaBehaviorInventory.total !== authoritativeCounts.behaviors
		|| gapLedger.sources.migrationLedger.registrations.total !== authoritativeCounts.registrations
		|| gapLedger.sources.migrationLedger.domains.total !== authoritativeCounts.domains
		|| gapLedger.sources.parityEvidence.total !== parityEvidence.records.length)
		throw new Error("P8 C0 gap ledger source summaries are inconsistent");
	const migrationRegistrationStatus = countBy(migrationLedger.registrationEntries, "status");
	const migrationDomainStatus = countBy(migrationLedger.domainEntries, "status");
	const expectedAcquisition = new Set(migrationLedger.registrationEntries
		.filter(entry => entry.status === "implemented" && ["block", "item"].includes(entry.kind))
		.flatMap(entry => entry.mapping.targets)
		.filter(identifier => identifier.startsWith("createbedrock:")));
	const acquisitionIds = new Set(acquisition.entries.map(entry => entry.identifier));
	const documents = [
		sourceDocument("acquisition", "data/p7-1-acquisition-ledger.json", acquisition, {
			entries: acquisition.entries.length,
			missing: acquisition.summary.missing ?? 0
		}),
		sourceDocument("behaviorInventory", "data/java-behavior-inventory.json", behaviorInventory, {
			entries: behaviorInventory.entries.length,
			status: countBy(behaviorInventory.entries, "status")
		}),
		sourceDocument("c4SemanticDifferences", "data/p8-c4-semantic-differences.json", c4SemanticDifferences, {
			externalCompatibilityEntries: c4SemanticDifferences.summary.externalCompatibilityEntries,
			platformCapabilityBlocked: c4SemanticDifferences.summary.platformCapabilityBlocked,
			records: c4SemanticDifferences.records.length
		}),
		sourceDocument("domainConvergence", "data/p8-4-domain-convergence.json", domainConvergence, {
			entries: domainConvergence.entries.length,
			status: domainConvergence.summary
		}),
		sourceDocument("domainInventory", "data/domain-inventory.json", domainInventory, {
			entries: authoritativeCounts.domains
		}),
		sourceDocument("gapLedger", "data/p7-7-gap-ledger.json", gapLedger, {
			classifications: gapLedger.summary.classifications,
			entries: gapLedger.entries.length
		}),
		sourceDocument("migrationLedger", "data/migration-ledger.json", migrationLedger, {
			domains: migrationLedger.domainEntries.length,
			domainStatus: migrationDomainStatus,
			registrations: migrationLedger.registrationEntries.length,
			registrationStatus: migrationRegistrationStatus
		}),
		sourceDocument("parityEvidence", "data/p8-parity-evidence-ledger.json", parityEvidence, {
			evidenceState: parityEvidence.summary.evidenceState,
			records: parityEvidence.records.length
		}),
		sourceDocument("registrationCatalog", "data/java-registration-catalog.json", registrationCatalog, {
			entries: registrationCatalog.entries.length
		})
	].sort((left, right) => left.id.localeCompare(right.id));
	const openResponsibilities = [];
	if (acquisition.summary.missing || acquisitionIds.size !== expectedAcquisition.size
		|| [...expectedAcquisition].some(identifier => !acquisitionIds.has(identifier)))
		openResponsibilities.push({
			expectedEntries: expectedAcquisition.size,
			id: "C1/acquisition-scope",
			observedEntries: acquisition.entries.length,
			owner: "P8-C1",
			reason: "The acquisition ledger does not cover the complete projected survival-content scope.",
			state: "open"
		});
	const document = {
		schemaVersion: P8_INTEGRITY_BASELINE_SCHEMA_VERSION,
		generatedAt: "deterministic",
		generatedFrom: P8_INTEGRITY_DOCUMENTS.map(([, path]) => path),
		javaBaseline: P8_INTEGRITY_JAVA_BASELINE,
		authoritativeCounts,
		documents,
		openResponsibilities
	};
	document.fingerprint = digest({
		authoritativeCounts,
		documents,
		javaBaseline: document.javaBaseline,
		openResponsibilities
	});
	validateP8IntegrityBaseline(document);
	return document;
}
