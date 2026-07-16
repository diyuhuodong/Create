import { validateMigrationMatrix } from "./migration-matrix-schema.mjs";

export const STAGE3_WORK_QUEUE_SCHEMA_VERSION = 1;

export const DELIVERY_PACKAGES = new Set([
	"completed:S3-7",
	"completed:S3-9",
	"completed:S3-10",
    "S3-8A",
    "S3-8B",
    "S3-9",
    "S3-10",
    "S3-11",
    "S3-12",
    "S3-14"
]);

const REQUIRED_ENTRY_FIELDS = [
    "acceptanceId",
    "assetPlan",
    "bedrockIdentifier",
    "blocker",
    "dependencies",
    "deliveryPackage",
    "domain",
    "javaIdentifier",
    "kind",
    "lootPlan",
    "matrixStatus",
    "recipePlan",
    "resourcePlan",
    "testPlan"
];

function isNonEmptyString(value) {
    return typeof value === "string" && value.length > 0;
}

function sameEntry(left, right) {
    return left.acceptanceId === right.acceptanceId
        && left.javaIdentifier === right.javaIdentifier
        && left.bedrockIdentifier === right.bedrockIdentifier
        && left.domain === right.domain
        && left.kind === right.kind
        && left.matrixStatus === right.status;
}

export function validateStage3WorkQueue(queue, matrix) {
    validateMigrationMatrix(matrix);
    if (!queue || typeof queue !== "object" || Array.isArray(queue))
        throw new TypeError("Stage-3 work queue must be an object");
    if (queue.schemaVersion !== STAGE3_WORK_QUEUE_SCHEMA_VERSION)
        throw new Error(`Stage-3 work queue must use schema version ${STAGE3_WORK_QUEUE_SCHEMA_VERSION}`);
    if (!Array.isArray(queue.entries) || queue.entries.length === 0)
        throw new Error("Stage-3 work queue must contain entries");

    const matrixEntries = matrix.entries.filter(entry => entry.phase === 3);
    const remaining = new Map(matrixEntries.map(entry => [entry.acceptanceId, entry]));
    const deliveryCounts = new Map();
    for (const entry of queue.entries) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry))
            throw new Error("Stage-3 work queue entries must be objects");
        for (const field of REQUIRED_ENTRY_FIELDS) {
            if (field === "dependencies") {
                if (!Array.isArray(entry.dependencies) || !entry.dependencies.every(isNonEmptyString))
                    throw new Error(`Stage-3 queue entry ${entry.acceptanceId} has invalid dependencies`);
            } else if (field === "blocker") {
                if (entry.blocker !== null && !isNonEmptyString(entry.blocker))
                    throw new Error(`Stage-3 queue entry ${entry.acceptanceId} has invalid blocker`);
            } else if (!isNonEmptyString(entry[field])) {
                throw new Error(`Stage-3 queue entry is missing ${field}`);
            }
        }
        if (!DELIVERY_PACKAGES.has(entry.deliveryPackage))
            throw new Error(`Stage-3 queue entry ${entry.acceptanceId} has unknown delivery package ${entry.deliveryPackage}`);
        const matrixEntry = remaining.get(entry.acceptanceId);
        if (!matrixEntry)
            throw new Error(`Stage-3 queue entry ${entry.acceptanceId} is not a unique phase-3 matrix entry`);
        if (!sameEntry(entry, matrixEntry))
            throw new Error(`Stage-3 queue entry ${entry.acceptanceId} no longer matches the migration matrix`);
        if (matrixEntry.status === "blocked" && entry.deliveryPackage !== "S3-14")
            throw new Error(`Blocked queue entry ${entry.acceptanceId} must be assigned to S3-14`);
		if (matrixEntry.domain === "redstone" && entry.deliveryPackage !== "S3-14")
			throw new Error(`Redstone queue entry ${entry.acceptanceId} must be assigned to S3-14`);
		const staticContentPackage = matrixEntry.domain === "content"
			&& ["S3-8A", "S3-8B"].includes(entry.deliveryPackage);
        if (matrixEntry.status === "static_verified" && !entry.deliveryPackage.startsWith("completed:S3-") && !staticContentPackage)
            throw new Error(`Static queue entry ${entry.acceptanceId} must be attributed to its completed Stage-3 package`);
        if (matrixEntry.status === "blocked" && entry.blocker !== matrixEntry.blockingReason)
            throw new Error(`Blocked queue entry ${entry.acceptanceId} must preserve its matrix blocker`);
        if (matrixEntry.status !== "blocked" && entry.blocker !== null)
            throw new Error(`Unblocked queue entry ${entry.acceptanceId} must not add a blocker`);
        remaining.delete(entry.acceptanceId);
        deliveryCounts.set(entry.deliveryPackage, (deliveryCounts.get(entry.deliveryPackage) ?? 0) + 1);
    }
    if (remaining.size > 0)
        throw new Error(`Stage-3 work queue is missing ${remaining.size} matrix entries`);
    if (queue.entries.length !== matrixEntries.length)
        throw new Error("Stage-3 work queue contains duplicate matrix entries");

    return {
        entries: queue.entries.length,
        deliveryCounts: Object.fromEntries([...deliveryCounts].sort(([left], [right]) => left.localeCompare(right)))
    };
}
