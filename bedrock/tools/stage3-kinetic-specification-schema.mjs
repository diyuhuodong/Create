export const STAGE3_KINETIC_SPECIFICATION_SCHEMA_VERSION = 1;

const S3_9_DELIVERY_PACKAGES = new Set(["S3-9", "completed:S3-9"]);

const DELIVERY_STATES = new Set(["implemented", "runtime_absorbed", "handoff"]);
const IMPLEMENTATION_PACKAGES = new Set(["S3-9", "S3-10", "S3-12", "S3-13", "S3-14", "S4"]);
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

export function validateStage3KineticSpecifications(specifications, workQueue) {
    if (!specifications || typeof specifications !== "object" || Array.isArray(specifications))
        throw new TypeError("Stage-3 kinetic specifications must be an object");
    if (specifications.schemaVersion !== STAGE3_KINETIC_SPECIFICATION_SCHEMA_VERSION)
        throw new Error(`Stage-3 kinetic specifications must use schema version ${STAGE3_KINETIC_SPECIFICATION_SCHEMA_VERSION}`);
    if (!Array.isArray(specifications.entries) || specifications.entries.length === 0)
        throw new Error("Stage-3 kinetic specifications must contain entries");
    if (!workQueue || !Array.isArray(workQueue.entries))
        throw new TypeError("Stage-3 kinetic specifications require a work queue");

    const queuedEntries = workQueue.entries.filter(entry => S3_9_DELIVERY_PACKAGES.has(entry.deliveryPackage));
    const remaining = new Map(queuedEntries.map(entry => [entry.acceptanceId, entry]));
    for (const entry of specifications.entries) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry))
            throw new Error("Stage-3 kinetic specification entries must be objects");
        for (const field of REQUIRED_FIELDS) {
            const valid = field === "javaEvidencePaths"
                ? nonEmptyStringArray(entry[field])
                : nonEmptyString(entry[field]);
            if (!valid)
                throw new Error(`Kinetic specification ${entry.acceptanceId} has invalid ${field}`);
        }
        if (!DELIVERY_STATES.has(entry.deliveryState))
            throw new Error(`Kinetic specification ${entry.acceptanceId} has unknown delivery state`);
        if (!IMPLEMENTATION_PACKAGES.has(entry.implementationPackage))
            throw new Error(`Kinetic specification ${entry.acceptanceId} has unknown implementation package`);
        if (entry.deliveryState === "handoff" && entry.implementationPackage === "S3-9")
            throw new Error(`Kinetic handoff ${entry.acceptanceId} cannot claim S3-9 delivery`);
        if (entry.deliveryState !== "handoff" && entry.implementationPackage !== "S3-9")
            throw new Error(`Kinetic delivery ${entry.acceptanceId} must be owned by S3-9`);
        const queued = remaining.get(entry.acceptanceId);
        if (!queued)
            throw new Error(`Kinetic specification ${entry.acceptanceId} is not a unique S3-9 queue entry`);
        for (const field of ["bedrockIdentifier", "javaIdentifier", "kind"]) {
            if (entry[field] !== queued[field])
                throw new Error(`Kinetic specification ${entry.acceptanceId} no longer matches work-queue ${field}`);
        }
        remaining.delete(entry.acceptanceId);
    }
    if (remaining.size > 0)
        throw new Error(`Stage-3 kinetic specifications are missing ${remaining.size} S3-9 entries`);
    if (specifications.entries.length !== queuedEntries.length)
        throw new Error("Stage-3 kinetic specifications contain duplicate S3-9 entries");
    return { entries: specifications.entries.length };
}
