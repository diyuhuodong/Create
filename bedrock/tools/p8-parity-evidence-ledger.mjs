export const P8_PARITY_EVIDENCE_LEDGER_SCHEMA_VERSION = 1;

function assertObject(value, label) {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new TypeError(`P8 parity evidence ${label} must be an object`);
}

function assertString(value, label) {
	if (typeof value !== "string" || value.length === 0)
		throw new TypeError(`P8 parity evidence ${label} must be a non-empty string`);
}

function strings(values, label) {
	if (!Array.isArray(values) || values.some(value => typeof value !== "string" || value.length === 0))
		throw new TypeError(`P8 parity evidence ${label} must be a string array`);
	return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function countBy(entries, key) {
	return Object.fromEntries([...new Set(entries.map(entry => String(entry[key])))].sort().map(value => [
		value,
		entries.filter(entry => String(entry[key]) === value).length
	]));
}

function evidence({ bedrockRuntime = [], platformScenarios = [], resourceProjections = [], staticContracts = [], staticTests = [] } = {}) {
	return {
		bedrockRuntime: strings(bedrockRuntime, "Bedrock runtime"),
		platformScenarios: strings(platformScenarios, "platform scenarios"),
		resourceProjections: strings(resourceProjections, "resource projections"),
		staticContracts: strings(staticContracts, "static contracts"),
		staticTests: strings(staticTests, "static tests")
	};
}

function evidenceState(record) {
	return record.evidence.bedrockRuntime.length > 0
		&& record.evidence.staticTests.length > 0
		&& record.evidence.platformScenarios.length > 0
		? "linked"
		: "pending";
}

export function validateP8EvidenceRecordCompletion(record) {
	assertObject(record, "completion record");
	assertObject(record.evidence, "completion evidence");
	for (const field of ["bedrockRuntime", "platformScenarios", "staticTests"])
		if (!Array.isArray(record.evidence[field]) || record.evidence[field].length === 0)
			throw new Error(`P8 parity evidence record ${record.id ?? "unknown"} is missing ${field}`);
	if (record.recordType === "registration" && (!Array.isArray(record.evidence.resourceProjections) || record.evidence.resourceProjections.length === 0))
		throw new Error(`P8 parity evidence registration ${record.id ?? "unknown"} is missing resource projections`);
	return true;
}

function matrixByRegistration(matrix) {
	return new Map(matrix.entries.map(entry => [`${entry.kind}:${entry.javaIdentifier}`, entry]));
}

export function validateP8ParityEvidenceLedger(document) {
	assertObject(document, "ledger");
	if (document.schemaVersion !== P8_PARITY_EVIDENCE_LEDGER_SCHEMA_VERSION)
		throw new Error(`P8 parity evidence must use schema version ${P8_PARITY_EVIDENCE_LEDGER_SCHEMA_VERSION}`);
	if (document.generatedAt !== "deterministic" || !Array.isArray(document.generatedFrom) || document.generatedFrom.length !== 4)
		throw new Error("P8 parity evidence requires four deterministic source documents");
	if (!Array.isArray(document.records) || !document.summary || typeof document.summary !== "object")
		throw new TypeError("P8 parity evidence requires records and a summary");
	const ids = new Set();
	for (const record of document.records) {
		assertObject(record, "record");
		for (const field of ["id", "owner", "recordType", "sourceKey", "status", "subject"])
			assertString(record[field], `record ${field}`);
		if (!["behavior", "domain", "registration"].includes(record.recordType))
			throw new Error(`P8 parity evidence record ${record.id} has an invalid record type`);
		if (record.id !== `${record.recordType}:${record.sourceKey}` || ids.has(record.id))
			throw new Error(`P8 parity evidence record ${record.id} has an invalid or duplicate identifier`);
		ids.add(record.id);
		strings(record.javaSources, `record ${record.id} Java sources`);
		const normalized = evidence(record.evidence);
		if (JSON.stringify(record.evidence) !== JSON.stringify(normalized))
			throw new Error(`P8 parity evidence record ${record.id} is not normalized`);
		if (record.evidenceState !== evidenceState(record))
			throw new Error(`P8 parity evidence record ${record.id} has a stale evidence state`);
		if (record.evidenceState === "linked")
			validateP8EvidenceRecordCompletion(record);
		if (record.recordType === "registration" && record.status === "implemented" && record.evidence.resourceProjections.length === 0)
			throw new Error(`P8 parity evidence implemented registration ${record.id} is missing resource projections`);
	}
	if (JSON.stringify(document.records.map(record => record.id)) !== JSON.stringify([...ids].sort((left, right) => left.localeCompare(right))))
		throw new Error("P8 parity evidence records must be sorted by identifier");
	const expectedSummary = {
		evidenceState: countBy(document.records, "evidenceState"),
		recordType: countBy(document.records, "recordType"),
		status: countBy(document.records, "status"),
		total: document.records.length
	};
	if (JSON.stringify(document.summary) !== JSON.stringify(expectedSummary))
		throw new Error("P8 parity evidence summary is stale");
	return { records: document.records.length, ...document.summary };
}

export function buildP8ParityEvidenceLedger({ catalog, javaBehaviorInventory, matrix, migrationLedger }) {
	for (const [name, value] of Object.entries({ catalog, javaBehaviorInventory, matrix, migrationLedger }))
		assertObject(value, name);
	if (!Array.isArray(catalog.entries) || !Array.isArray(javaBehaviorInventory.entries) || !Array.isArray(matrix.entries)
		|| !Array.isArray(migrationLedger.registrationEntries) || !Array.isArray(migrationLedger.domainEntries))
		throw new TypeError("P8 parity evidence inputs require entry arrays");
	const catalogBySourceKey = new Map(catalog.entries.map(entry => [entry.sourceKey, entry]));
	const legacyMatrix = matrixByRegistration(matrix);
	const registrations = migrationLedger.registrationEntries.map(entry => {
		const catalogEntry = catalogBySourceKey.get(entry.sourceKey);
		if (!catalogEntry)
			throw new Error(`P8 parity evidence registration ${entry.sourceKey} has no Java catalog source`);
		const legacy = legacyMatrix.get(`${entry.kind}:${entry.javaIdentifier}`);
		return {
			id: `registration:${entry.sourceKey}`,
			owner: entry.family,
			recordType: "registration",
			sourceKey: entry.sourceKey,
			status: entry.status,
			subject: entry.javaIdentifier,
			javaSources: strings(catalogEntry.sources, `registration ${entry.sourceKey} Java sources`),
			evidence: evidence({
				bedrockRuntime: legacy?.behaviorPath ? [legacy.behaviorPath] : [],
				resourceProjections: entry.mapping.targets,
				staticContracts: legacy?.acceptanceId ? [legacy.acceptanceId] : []
			})
		};
	});
	const domains = migrationLedger.domainEntries.map(entry => ({
		id: `domain:${entry.sourceKey}`,
		owner: entry.owner,
		recordType: "domain",
		sourceKey: entry.sourceKey,
		status: entry.status,
		subject: entry.source,
		javaSources: [entry.source],
		evidence: evidence({ staticContracts: entry.convergence.evidence })
	}));
	const behaviors = javaBehaviorInventory.entries.map(entry => ({
		id: `behavior:${entry.sourceKey}`,
		owner: entry.owner,
		recordType: "behavior",
		sourceKey: entry.sourceKey,
		status: entry.status,
		subject: entry.source,
		javaSources: [entry.source],
		evidence: evidence(entry.evidence)
	}));
	const records = [...registrations, ...domains, ...behaviors]
		.map(record => ({ ...record, evidenceState: evidenceState(record) }))
		.sort((left, right) => left.id.localeCompare(right.id));
	const document = {
		schemaVersion: P8_PARITY_EVIDENCE_LEDGER_SCHEMA_VERSION,
		generatedAt: "deterministic",
		generatedFrom: [
			"data/java-behavior-inventory.json",
			"data/java-registration-catalog.json",
			"data/migration-ledger.json",
			"data/migration-matrix.json"
		],
		records,
		summary: {
			evidenceState: countBy(records, "evidenceState"),
			recordType: countBy(records, "recordType"),
			status: countBy(records, "status"),
			total: records.length
		}
	};
	validateP8ParityEvidenceLedger(document);
	return document;
}
