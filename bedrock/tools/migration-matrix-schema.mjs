export const MATRIX_DOMAINS = new Set([
	"content",
	"contraptions",
	"equipment",
	"fluids",
	"kinetics",
	"logistics",
	"processing",
	"redstone",
	"schematics",
	"trains"
]);

export const MATRIX_RESOURCE_STATUSES = new Set([
	"complete",
	"not_required",
	"partial",
	"pending"
]);

export const MATRIX_SCHEMA_VERSION = 2;

export const MATRIX_STATUSES = new Set([
	"blocked",
	"implementation_in_progress",
	"realm_accepted",
	"specification_confirmed",
	"specification_pending",
	"static_verified"
]);

const REQUIRED_ENTRY_FIELDS = [
	"acceptanceId",
	"bedrockIdentifier",
	"domain",
	"javaIdentifier",
	"kind",
	"phase",
	"resourceStatus",
	"source",
	"status"
];

function isNullableString(value) {
	return value === null || typeof value === "string";
}

function isNonEmptyString(value) {
	return typeof value === "string" && value.length > 0;
}

export function validateMigrationMatrix(matrix) {
	if (!matrix || typeof matrix !== "object" || Array.isArray(matrix))
		throw new TypeError("Migration matrix must be an object");
	if (matrix.schemaVersion !== MATRIX_SCHEMA_VERSION)
		throw new Error(`Migration matrix must use schema version ${MATRIX_SCHEMA_VERSION}`);
	if (!Number.isInteger(matrix.classificationRulesVersion) || matrix.classificationRulesVersion < 1)
		throw new Error("Migration matrix must declare a positive classification rules version");
	if (!Array.isArray(matrix.entries) || matrix.entries.length === 0)
		throw new Error("Migration matrix must contain entries");

	const entryKeys = new Set();
	const acceptanceIds = new Set();
	for (const entry of matrix.entries) {
		if (!entry || typeof entry !== "object" || Array.isArray(entry))
			throw new Error("Migration matrix entries must be objects");
		for (const field of REQUIRED_ENTRY_FIELDS) {
			if (field !== "phase" && !isNonEmptyString(entry[field]))
				throw new Error(`Migration matrix entry is missing ${field}`);
		}
		if (!Number.isInteger(entry.phase) || entry.phase < 0 || entry.phase > 7)
			throw new Error(`Migration matrix entry ${entry.javaIdentifier} has an invalid phase`);
		if (!MATRIX_DOMAINS.has(entry.domain))
			throw new Error(`Migration matrix entry ${entry.javaIdentifier} has an unknown domain ${entry.domain}`);
		if (!MATRIX_RESOURCE_STATUSES.has(entry.resourceStatus))
			throw new Error(`Migration matrix entry ${entry.javaIdentifier} has an invalid resource status`);
		if (!MATRIX_STATUSES.has(entry.status))
			throw new Error(`Migration matrix entry ${entry.javaIdentifier} has an invalid status ${entry.status}`);
		if (!isNullableString(entry.behaviorPath) || !isNullableString(entry.blockingReason))
			throw new Error(`Migration matrix entry ${entry.javaIdentifier} has invalid nullable fields`);
		if (entry.behaviorPath === "" || entry.blockingReason === "")
			throw new Error(`Migration matrix entry ${entry.javaIdentifier} has empty nullable fields`);
		if (entry.persistenceSchema !== null && (!Number.isInteger(entry.persistenceSchema) || entry.persistenceSchema < 1))
			throw new Error(`Migration matrix entry ${entry.javaIdentifier} has an invalid persistence schema`);
		if (entry.status === "blocked" && (!entry.blockingReason || entry.blockingReason.length === 0))
			throw new Error(`Blocked migration matrix entry ${entry.javaIdentifier} requires a reason`);
		if (entry.status !== "blocked" && entry.blockingReason !== null)
			throw new Error(`Unblocked migration matrix entry ${entry.javaIdentifier} must not have a blocking reason`);

		const entryKey = `${entry.javaIdentifier}:${entry.kind}`;
		if (entryKeys.has(entryKey))
			throw new Error(`Migration matrix contains duplicate entry ${entryKey}`);
		entryKeys.add(entryKey);
		if (acceptanceIds.has(entry.acceptanceId))
			throw new Error(`Migration matrix contains duplicate acceptance ID ${entry.acceptanceId}`);
		acceptanceIds.add(entry.acceptanceId);
	}
}
