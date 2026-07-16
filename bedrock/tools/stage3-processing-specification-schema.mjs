export const STAGE3_PROCESSING_SPECIFICATION_SCHEMA_VERSION = 1;

const S3_11_DELIVERY_PACKAGES = new Set(["S3-11", "completed:S3-11"]);

const DELIVERY_STATES = new Set(["implemented", "runtime_absorbed"]);
const REQUIRED_FIELDS = [
	"acceptanceId",
	"bedrockIdentifier",
	"behaviorBoundary",
	"deliveryState",
	"implementationPackage",
	"javaEvidencePaths",
	"javaIdentifier",
	"kind",
	"recipeBoundary",
	"resourceBoundary",
	"testPlan"
];

function nonEmptyString(value) {
	return typeof value === "string" && value.length > 0;
}

function nonEmptyStringArray(value) {
	return Array.isArray(value) && value.length > 0 && value.every(nonEmptyString);
}

export function validateStage3ProcessingSpecifications(specifications, workQueue) {
	if (!specifications || typeof specifications !== "object" || Array.isArray(specifications))
		throw new TypeError("Stage-3 processing specifications must be an object");
	if (specifications.schemaVersion !== STAGE3_PROCESSING_SPECIFICATION_SCHEMA_VERSION)
		throw new Error(`Stage-3 processing specifications must use schema version ${STAGE3_PROCESSING_SPECIFICATION_SCHEMA_VERSION}`);
	if (!Array.isArray(specifications.entries) || specifications.entries.length === 0)
		throw new Error("Stage-3 processing specifications must contain entries");
	if (!workQueue || !Array.isArray(workQueue.entries))
		throw new TypeError("Stage-3 processing specifications require a work queue");

	const queuedEntries = workQueue.entries.filter(entry => S3_11_DELIVERY_PACKAGES.has(entry.deliveryPackage));
	const remaining = new Map(queuedEntries.map(entry => [entry.acceptanceId, entry]));
	for (const entry of specifications.entries) {
		if (!entry || typeof entry !== "object" || Array.isArray(entry))
			throw new Error("Stage-3 processing specification entries must be objects");
		for (const field of REQUIRED_FIELDS) {
			const valid = field === "javaEvidencePaths" ? nonEmptyStringArray(entry[field]) : nonEmptyString(entry[field]);
			if (!valid)
				throw new Error(`Processing specification ${entry.acceptanceId} has invalid ${field}`);
		}
		if (!DELIVERY_STATES.has(entry.deliveryState))
			throw new Error(`Processing specification ${entry.acceptanceId} has unknown delivery state`);
		if (entry.implementationPackage !== "S3-11")
			throw new Error(`Processing specification ${entry.acceptanceId} must be owned by S3-11`);
		if (entry.kind === "block_entity" && entry.deliveryState !== "runtime_absorbed")
			throw new Error(`Processing block-entity ${entry.acceptanceId} must be represented by the persistent runtime`);
		if (entry.kind !== "block_entity" && entry.deliveryState !== "implemented")
			throw new Error(`Processing resource ${entry.acceptanceId} must be implemented`);
		const queued = remaining.get(entry.acceptanceId);
		if (!queued)
			throw new Error(`Processing specification ${entry.acceptanceId} is not a unique S3-11 queue entry`);
		for (const field of ["bedrockIdentifier", "javaIdentifier", "kind"]) {
			if (entry[field] !== queued[field])
				throw new Error(`Processing specification ${entry.acceptanceId} no longer matches work-queue ${field}`);
		}
		remaining.delete(entry.acceptanceId);
	}
	if (remaining.size > 0)
		throw new Error(`Stage-3 processing specifications are missing ${remaining.size} S3-11 entries`);
	if (specifications.entries.length !== queuedEntries.length)
		throw new Error("Stage-3 processing specifications contain duplicate S3-11 entries");
	return { entries: specifications.entries.length };
}
