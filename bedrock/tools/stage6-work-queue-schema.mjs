import { validateMigrationMatrix } from "./migration-matrix-schema.mjs";

export const STAGE6_WORK_QUEUE_SCHEMA_VERSION = 1;

const PACKAGE_BY_ACCEPTANCE_ID = new Map([
	["EQUIPMENT-BACKTANK-BLOCK_ENTITY", "P6.1"],
	["EQUIPMENT-COPPER-BACKTANK-BLOCK", "P6.1"],
	["EQUIPMENT-COPPER-BACKTANK-ITEM", "P6.1"],
	["EQUIPMENT-COPPER-BACKTANK-PLACEABLE-ITEM", "P6.1"],
	["EQUIPMENT-COPPER-DIVING-BOOTS-ITEM", "P6.1"],
	["EQUIPMENT-COPPER-DIVING-HELMET-ITEM", "P6.1"],
	["EQUIPMENT-NETHERITE-BACKTANK-BLOCK", "P6.1"],
	["EQUIPMENT-NETHERITE-BACKTANK-ITEM", "P6.1"],
	["EQUIPMENT-NETHERITE-BACKTANK-PLACEABLE-ITEM", "P6.1"],
	["EQUIPMENT-NETHERITE-DIVING-BOOTS-ITEM", "P6.1"],
	["EQUIPMENT-NETHERITE-DIVING-HELMET-ITEM", "P6.1"],
	["EQUIPMENT-EXTENDO-GRIP-ITEM", "P6.2"],
	["EQUIPMENT-GOGGLES-ITEM", "P6.2"],
	["EQUIPMENT-WRENCH-ITEM", "P6.2"],
	["EQUIPMENT-POTATO-CANNON-ITEM", "P6.3"],
	["EQUIPMENT-TOOLBOX-BLOCK_ENTITY", "P6.4"]
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

export function stage6PackageFor(entry) {
	const deliveryPackage = PACKAGE_BY_ACCEPTANCE_ID.get(entry?.acceptanceId);
	if (!deliveryPackage)
		throw new Error(`Phase-6 entry ${entry?.acceptanceId ?? "unknown"} has no assigned delivery package`);
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

export function validateStage6WorkQueue(queue, matrix) {
	validateMigrationMatrix(matrix);
	if (!queue || typeof queue !== "object" || Array.isArray(queue))
		throw new TypeError("Stage-6 work queue must be an object");
	if (queue.schemaVersion !== STAGE6_WORK_QUEUE_SCHEMA_VERSION)
		throw new Error(`Stage-6 work queue must use schema version ${STAGE6_WORK_QUEUE_SCHEMA_VERSION}`);
	if (!Array.isArray(queue.entries) || queue.entries.length === 0)
		throw new Error("Stage-6 work queue must contain entries");

	const matrixEntries = matrix.entries.filter(entry => entry.phase === 6);
	const remaining = new Map(matrixEntries.map(entry => [entry.acceptanceId, entry]));
	const deliveryCounts = new Map();
	for (const entry of queue.entries) {
		if (!entry || typeof entry !== "object" || Array.isArray(entry))
			throw new Error("Stage-6 work queue entries must be objects");
		for (const field of REQUIRED_ENTRY_FIELDS)
			if (!nonEmptyString(entry[field]))
				throw new Error(`Stage-6 queue entry ${entry.acceptanceId ?? "unknown"} is missing ${field}`);
		if (!Array.isArray(entry.platformScenarios) || entry.platformScenarios.length === 0 || !entry.platformScenarios.every(nonEmptyString))
			throw new Error(`Stage-6 queue entry ${entry.acceptanceId} requires platform scenarios`);
		const matrixEntry = remaining.get(entry.acceptanceId);
		if (!matrixEntry)
			throw new Error(`Stage-6 queue entry ${entry.acceptanceId} is not a unique phase-6 matrix entry`);
		if (!sameMatrixEntry(entry, matrixEntry))
			throw new Error(`Stage-6 queue entry ${entry.acceptanceId} no longer matches the migration matrix`);
		const deliveryPackage = stage6PackageFor(matrixEntry);
		const expectedDelivery = matrixEntry.status === "static_verified" ? `completed:${deliveryPackage}` : deliveryPackage;
		if (entry.deliveryPackage !== expectedDelivery)
			throw new Error(`Stage-6 queue entry ${entry.acceptanceId} must be assigned to ${expectedDelivery}`);
		remaining.delete(entry.acceptanceId);
		deliveryCounts.set(entry.deliveryPackage, (deliveryCounts.get(entry.deliveryPackage) ?? 0) + 1);
	}
	if (remaining.size > 0)
		throw new Error(`Stage-6 work queue is missing ${remaining.size} matrix entries`);
	if (queue.entries.length !== matrixEntries.length)
		throw new Error("Stage-6 work queue contains duplicate matrix entries");
	return { deliveryCounts: Object.fromEntries([...deliveryCounts].sort(([left], [right]) => left.localeCompare(right))), entries: queue.entries.length };
}
