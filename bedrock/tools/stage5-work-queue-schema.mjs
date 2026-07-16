import { validateMigrationMatrix } from "./migration-matrix-schema.mjs";

export const STAGE5_WORK_QUEUE_SCHEMA_VERSION = 1;

const PACKAGE_BY_IDENTIFIER = new Map([
	["controller_rail", "P5.1"],
	["track_signal", "P5.1"],
	["track_observer", "P5.1"],
	["schedule", "P5.1"],
	["bogey", "P5.2"],
	["small_bogey", "P5.2"],
	["large_bogey", "P5.2"],
	["fake_track", "P5.2"],
	["train_door", "P5.2"],
	["train_trapdoor", "P5.2"],
	["package", "P5.3"],
	["package_filter", "P5.3"],
	["packager", "P5.3"],
	["repackager", "P5.3"],
	["package_frogport", "P5.4"],
	["package_postbox", "P5.4"],
	["packager_link", "P5.4"],
	["factory_gauge", "P5.4"],
	["factory_panel", "P5.4"]
]);

const REQUIRED_ENTRY_FIELDS = [
	"acceptanceId",
	"assetPlan",
	"behaviorPlan",
	"bedrockIdentifier",
	"deliveryPackage",
	"domain",
	"javaIdentifier",
	"javaSource",
	"kind",
	"matrixStatus",
	"persistencePlan",
	"resourcePlan",
	"testPlan"
];

function nonEmptyString(value) {
	return typeof value === "string" && value.length > 0;
}

export function stage5PackageFor(entry) {
	const identifier = entry.javaIdentifier?.replace("create:", "");
	const deliveryPackage = PACKAGE_BY_IDENTIFIER.get(identifier);
	if (!deliveryPackage)
		throw new Error(`Phase-5 entry ${entry.acceptanceId} has no assigned delivery package`);
	return deliveryPackage;
}

function sameMatrixEntry(queueEntry, matrixEntry) {
	return queueEntry.acceptanceId === matrixEntry.acceptanceId
		&& queueEntry.bedrockIdentifier === matrixEntry.bedrockIdentifier
		&& queueEntry.domain === matrixEntry.domain
		&& queueEntry.javaIdentifier === matrixEntry.javaIdentifier
		&& queueEntry.javaSource === matrixEntry.source
		&& queueEntry.kind === matrixEntry.kind
		&& queueEntry.matrixStatus === matrixEntry.status;
}

export function validateStage5WorkQueue(queue, matrix) {
	validateMigrationMatrix(matrix);
	if (!queue || typeof queue !== "object" || Array.isArray(queue))
		throw new TypeError("Stage-5 work queue must be an object");
	if (queue.schemaVersion !== STAGE5_WORK_QUEUE_SCHEMA_VERSION)
		throw new Error(`Stage-5 work queue must use schema version ${STAGE5_WORK_QUEUE_SCHEMA_VERSION}`);
	if (!Array.isArray(queue.entries) || queue.entries.length === 0)
		throw new Error("Stage-5 work queue must contain entries");

	const matrixEntries = matrix.entries.filter(entry => entry.phase === 5);
	const remaining = new Map(matrixEntries.map(entry => [entry.acceptanceId, entry]));
	const deliveryCounts = new Map();
	for (const entry of queue.entries) {
		if (!entry || typeof entry !== "object" || Array.isArray(entry))
			throw new Error("Stage-5 work queue entries must be objects");
		for (const field of REQUIRED_ENTRY_FIELDS)
			if (!nonEmptyString(entry[field]))
				throw new Error(`Stage-5 queue entry ${entry.acceptanceId ?? "unknown"} is missing ${field}`);
		if (!Array.isArray(entry.platformScenarios) || entry.platformScenarios.length === 0 || !entry.platformScenarios.every(nonEmptyString))
			throw new Error(`Stage-5 queue entry ${entry.acceptanceId} requires platform scenarios`);
		const matrixEntry = remaining.get(entry.acceptanceId);
		if (!matrixEntry)
			throw new Error(`Stage-5 queue entry ${entry.acceptanceId} is not a unique phase-5 matrix entry`);
		if (!sameMatrixEntry(entry, matrixEntry))
			throw new Error(`Stage-5 queue entry ${entry.acceptanceId} no longer matches the migration matrix`);
		const deliveryPackage = stage5PackageFor(matrixEntry);
		const expectedDelivery = matrixEntry.status === "static_verified" ? `completed:${deliveryPackage}` : deliveryPackage;
		if (entry.deliveryPackage !== expectedDelivery)
			throw new Error(`Stage-5 queue entry ${entry.acceptanceId} must be assigned to ${expectedDelivery}`);
		remaining.delete(entry.acceptanceId);
		deliveryCounts.set(entry.deliveryPackage, (deliveryCounts.get(entry.deliveryPackage) ?? 0) + 1);
	}
	if (remaining.size > 0)
		throw new Error(`Stage-5 work queue is missing ${remaining.size} matrix entries`);
	if (queue.entries.length !== matrixEntries.length)
		throw new Error("Stage-5 work queue contains duplicate matrix entries");
	return { deliveryCounts: Object.fromEntries([...deliveryCounts].sort(([left], [right]) => left.localeCompare(right))), entries: queue.entries.length };
}
