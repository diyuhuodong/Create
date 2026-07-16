import { validateMigrationMatrix } from "./migration-matrix-schema.mjs";

export const STAGE4_WORK_QUEUE_SCHEMA_VERSION = 1;

const PACKAGE_BY_IDENTIFIER = new Map([
	["contraption", "P4.1"],
	["stationary_contraption", "P4.1"],
	["contraption_controls", "P4.1"],
	["mechanical_piston", "P4.2"],
	["sticky_mechanical_piston", "P4.2"],
	["mechanical_piston_head", "P4.2"],
	["rope_pulley", "P4.2"],
	["rope", "P4.2"],
	["pulley_magnet", "P4.2"],
	["hose_pulley", "P4.2"],
	["gantry_carriage", "P4.2"],
	["gantry_contraption", "P4.2"],
	["gantry_pinion", "P4.2"],
	["gantry_shaft", "P4.2"],
	["elevator_contact", "P4.3"],
	["elevator_pulley", "P4.3"],
	["deployer", "P4.4"],
	["drill", "P4.4"],
	["mechanical_drill", "P4.4"],
	["harvester", "P4.4"],
	["mechanical_harvester", "P4.4"],
	["mechanical_arm", "P4.4"],
	["cart_assembler", "P4.5"],
	["chest_minecart_contraption", "P4.5"],
	["furnace_minecart_contraption", "P4.5"],
	["minecart_anchor", "P4.5"],
	["minecart_contraption", "P4.5"],
	["minecart_coupling", "P4.5"],
	["carriage_contraption", "P4.5"],
	["seat", "P4.5"],
	["sticker", "P4.6"]
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

export function stage4PackageFor(entry) {
	if (entry.domain === "schematics")
		return "P4.7";
	const identifier = entry.javaIdentifier?.replace("create:", "");
	const deliveryPackage = PACKAGE_BY_IDENTIFIER.get(identifier);
	if (!deliveryPackage)
		throw new Error(`Phase-4 entry ${entry.acceptanceId} has no assigned delivery package`);
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

export function validateStage4WorkQueue(queue, matrix) {
	validateMigrationMatrix(matrix);
	if (!queue || typeof queue !== "object" || Array.isArray(queue))
		throw new TypeError("Stage-4 work queue must be an object");
	if (queue.schemaVersion !== STAGE4_WORK_QUEUE_SCHEMA_VERSION)
		throw new Error(`Stage-4 work queue must use schema version ${STAGE4_WORK_QUEUE_SCHEMA_VERSION}`);
	if (!Array.isArray(queue.entries) || queue.entries.length === 0)
		throw new Error("Stage-4 work queue must contain entries");

	const matrixEntries = matrix.entries.filter(entry => entry.phase === 4);
	const remaining = new Map(matrixEntries.map(entry => [entry.acceptanceId, entry]));
	const deliveryCounts = new Map();
	for (const entry of queue.entries) {
		if (!entry || typeof entry !== "object" || Array.isArray(entry))
			throw new Error("Stage-4 work queue entries must be objects");
		for (const field of REQUIRED_ENTRY_FIELDS)
			if (!nonEmptyString(entry[field]))
				throw new Error(`Stage-4 queue entry ${entry.acceptanceId ?? "unknown"} is missing ${field}`);
		if (!Array.isArray(entry.platformScenarios) || entry.platformScenarios.length === 0 || !entry.platformScenarios.every(nonEmptyString))
			throw new Error(`Stage-4 queue entry ${entry.acceptanceId} requires platform scenarios`);
		const matrixEntry = remaining.get(entry.acceptanceId);
		if (!matrixEntry)
			throw new Error(`Stage-4 queue entry ${entry.acceptanceId} is not a unique phase-4 matrix entry`);
		if (!sameMatrixEntry(entry, matrixEntry))
			throw new Error(`Stage-4 queue entry ${entry.acceptanceId} no longer matches the migration matrix`);
		const packageName = stage4PackageFor(matrixEntry);
		const expectedDelivery = matrixEntry.status === "static_verified" ? `completed:${packageName}` : packageName;
		if (entry.deliveryPackage !== expectedDelivery)
			throw new Error(`Stage-4 queue entry ${entry.acceptanceId} must be assigned to ${expectedDelivery}`);
		remaining.delete(entry.acceptanceId);
		deliveryCounts.set(entry.deliveryPackage, (deliveryCounts.get(entry.deliveryPackage) ?? 0) + 1);
	}
	if (remaining.size > 0)
		throw new Error(`Stage-4 work queue is missing ${remaining.size} matrix entries`);
	if (queue.entries.length !== matrixEntries.length)
		throw new Error("Stage-4 work queue contains duplicate matrix entries");

	return {
		deliveryCounts: Object.fromEntries([...deliveryCounts].sort(([left], [right]) => left.localeCompare(right))),
		entries: queue.entries.length
	};
}
