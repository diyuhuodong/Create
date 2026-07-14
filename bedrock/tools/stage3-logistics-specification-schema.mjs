export const STAGE3_LOGISTICS_SPECIFICATION_SCHEMA_VERSION = 1;

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
	"resourceBoundary",
	"testPlan"
];

function nonEmptyString(value) {
	return typeof value === "string" && value.length > 0;
}

function nonEmptyStringArray(value) {
	return Array.isArray(value) && value.length > 0 && value.every(nonEmptyString);
}

export function validateStage3LogisticsSpecifications(specifications, workQueue) {
	if (!specifications || typeof specifications !== "object" || Array.isArray(specifications))
		throw new TypeError("Stage-3 logistics specifications must be an object");
	if (specifications.schemaVersion !== STAGE3_LOGISTICS_SPECIFICATION_SCHEMA_VERSION)
		throw new Error(`Stage-3 logistics specifications must use schema version ${STAGE3_LOGISTICS_SPECIFICATION_SCHEMA_VERSION}`);
	if (!Array.isArray(specifications.entries) || specifications.entries.length === 0)
		throw new Error("Stage-3 logistics specifications must contain entries");
	if (!workQueue || !Array.isArray(workQueue.entries))
		throw new TypeError("Stage-3 logistics specifications require a work queue");

	const queuedEntries = workQueue.entries.filter(entry => entry.deliveryPackage === "S3-10");
	const remaining = new Map(queuedEntries.map(entry => [entry.acceptanceId, entry]));
	for (const entry of specifications.entries) {
		if (!entry || typeof entry !== "object" || Array.isArray(entry))
			throw new Error("Stage-3 logistics specification entries must be objects");
		for (const field of REQUIRED_FIELDS) {
			const valid = field === "javaEvidencePaths" ? nonEmptyStringArray(entry[field]) : nonEmptyString(entry[field]);
			if (!valid)
				throw new Error(`Logistics specification ${entry.acceptanceId} has invalid ${field}`);
		}
		if (!DELIVERY_STATES.has(entry.deliveryState))
			throw new Error(`Logistics specification ${entry.acceptanceId} has unknown delivery state`);
		if (entry.implementationPackage !== "S3-10")
			throw new Error(`Logistics specification ${entry.acceptanceId} must be owned by S3-10`);
		if (entry.kind === "block_entity" && entry.deliveryState !== "runtime_absorbed")
			throw new Error(`Logistics block-entity ${entry.acceptanceId} must be represented by the durable runtime`);
		if (entry.kind !== "block_entity" && entry.deliveryState !== "implemented")
			throw new Error(`Logistics resource ${entry.acceptanceId} must be implemented`);
		const queued = remaining.get(entry.acceptanceId);
		if (!queued)
			throw new Error(`Logistics specification ${entry.acceptanceId} is not a unique S3-10 queue entry`);
		for (const field of ["bedrockIdentifier", "javaIdentifier", "kind"]) {
			if (entry[field] !== queued[field])
				throw new Error(`Logistics specification ${entry.acceptanceId} no longer matches work-queue ${field}`);
		}
		remaining.delete(entry.acceptanceId);
	}
	if (remaining.size > 0)
		throw new Error(`Stage-3 logistics specifications are missing ${remaining.size} S3-10 entries`);
	if (specifications.entries.length !== queuedEntries.length)
		throw new Error("Stage-3 logistics specifications contain duplicate S3-10 entries");
	return { entries: specifications.entries.length };
}
