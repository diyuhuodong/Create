export const STAGE3_FLUID_SPECIFICATION_SCHEMA_VERSION = 1;

const DELIVERY_STATES = new Set(["implemented", "runtime_absorbed"]);
const S3_12_DELIVERY_PACKAGES = new Set(["S3-12", "completed:S3-12"]);
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

export function validateStage3FluidSpecifications(specifications, workQueue) {
	if (!specifications || typeof specifications !== "object" || Array.isArray(specifications))
		throw new TypeError("Stage-3 fluid specifications must be an object");
	if (specifications.schemaVersion !== STAGE3_FLUID_SPECIFICATION_SCHEMA_VERSION)
		throw new Error(`Stage-3 fluid specifications must use schema version ${STAGE3_FLUID_SPECIFICATION_SCHEMA_VERSION}`);
	if (!Array.isArray(specifications.entries) || specifications.entries.length === 0)
		throw new Error("Stage-3 fluid specifications must contain entries");
	if (!workQueue || !Array.isArray(workQueue.entries))
		throw new TypeError("Stage-3 fluid specifications require a work queue");

	const queuedEntries = workQueue.entries.filter(entry => S3_12_DELIVERY_PACKAGES.has(entry.deliveryPackage));
	const remaining = new Map(queuedEntries.map(entry => [entry.acceptanceId, entry]));
	for (const entry of specifications.entries) {
		if (!entry || typeof entry !== "object" || Array.isArray(entry))
			throw new Error("Stage-3 fluid specification entries must be objects");
		for (const field of REQUIRED_FIELDS) {
			const valid = field === "javaEvidencePaths" ? nonEmptyStringArray(entry[field]) : nonEmptyString(entry[field]);
			if (!valid)
				throw new Error(`Fluid specification ${entry.acceptanceId} has invalid ${field}`);
		}
		if (!DELIVERY_STATES.has(entry.deliveryState))
			throw new Error(`Fluid specification ${entry.acceptanceId} has an unknown delivery state`);
		if (entry.implementationPackage !== "S3-12")
			throw new Error(`Fluid specification ${entry.acceptanceId} must be owned by S3-12`);
		if (entry.kind === "block_entity" && entry.deliveryState !== "runtime_absorbed")
			throw new Error(`Fluid block entity ${entry.acceptanceId} must be represented by the persistent runtime`);
		if (entry.kind !== "block_entity" && entry.deliveryState !== "implemented")
			throw new Error(`Fluid resource ${entry.acceptanceId} must be implemented`);
		const queued = remaining.get(entry.acceptanceId);
		if (!queued)
			throw new Error(`Fluid specification ${entry.acceptanceId} is not a unique S3-12 queue entry`);
		for (const field of ["bedrockIdentifier", "javaIdentifier", "kind"]) {
			if (entry[field] !== queued[field])
				throw new Error(`Fluid specification ${entry.acceptanceId} no longer matches work-queue ${field}`);
		}
		remaining.delete(entry.acceptanceId);
	}
	if (remaining.size > 0)
		throw new Error(`Stage-3 fluid specifications are missing ${remaining.size} S3-12 entries`);
	if (specifications.entries.length !== queuedEntries.length)
		throw new Error("Stage-3 fluid specifications contain duplicate S3-12 entries");
	return { entries: specifications.entries.length };
}
