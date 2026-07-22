import { createAssemblyTransform } from "./assembly-transform.js";
import { normalizeDynamicAssemblySnapshot } from "./dynamic-assembly-snapshot.js";

export const DYNAMIC_ASSEMBLY_AUTHORITY_SCHEMA = 2;
export const ASSEMBLY_PHASES = Object.freeze(["capturing", "detached", "active", "disassembling", "frozen", "retired"]);
export const ASSEMBLY_JOURNAL_STEPS = Object.freeze({
	assemble: ["collected", "snapshot_written", "sources_claimed", "adapters_detached", "blocks_removed", "authority_committed", "projection_built"],
	disassemble: ["materialized", "destinations_claimed", "blocks_placed", "adapters_restored", "receipts_verified", "sources_released", "projection_removed"]
});

function clone(value) {
	return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function normalizeKeys(value, label) {
	if (!Array.isArray(value) || value.some(key => typeof key !== "string" || key.length === 0))
		throw new TypeError(`${label} must be an array of non-empty keys`);
	return [...new Set(value)].sort();
}

export function createAssemblyJournal(operation, transactionId) {
	if (!ASSEMBLY_JOURNAL_STEPS[operation] || typeof transactionId !== "string" || transactionId.length === 0)
		throw new TypeError("Assembly journals require a known operation and transaction id");
	return { completedSteps: [], operation, transactionId };
}

export function advanceAssemblyJournal(value, step) {
	const journal = normalizeAssemblyJournal(value);
	const steps = ASSEMBLY_JOURNAL_STEPS[journal.operation];
	const expected = steps[journal.completedSteps.length];
	if (step !== expected)
		throw new Error(`Assembly journal expected ${expected ?? "completion"}, received ${step}`);
	return { ...journal, completedSteps: [...journal.completedSteps, step] };
}

export function normalizeAssemblyJournal(value) {
	if (!value || !ASSEMBLY_JOURNAL_STEPS[value.operation] || typeof value.transactionId !== "string" || !Array.isArray(value.completedSteps))
		throw new TypeError("Invalid dynamic assembly journal");
	const allowed = ASSEMBLY_JOURNAL_STEPS[value.operation];
	for (let index = 0; index < value.completedSteps.length; index++)
		if (value.completedSteps[index] !== allowed[index])
			throw new TypeError("Dynamic assembly journal steps must be an ordered prefix");
	return { completedSteps: [...value.completedSteps], operation: value.operation, transactionId: value.transactionId };
}

export function normalizeDynamicAssemblyAuthorityRecord(value) {
	if (!value || typeof value.id !== "string" || value.id.length === 0 || !ASSEMBLY_PHASES.includes(value.phase))
		throw new TypeError("Invalid dynamic assembly authority record");
	if (value.schemaVersion !== undefined && ![1, DYNAMIC_ASSEMBLY_AUTHORITY_SCHEMA].includes(value.schemaVersion))
		throw new TypeError("Unsupported dynamic assembly authority schema");
	if (!Number.isInteger(value.epoch) || value.epoch < 1)
		throw new TypeError("Dynamic assembly authority epochs must be positive integers");
	const record = {
		destinationClaims: normalizeKeys(value.destinationClaims ?? [], "Dynamic assembly destination claims"),
		epoch: value.epoch,
		id: value.id,
		journal: value.journal ? normalizeAssemblyJournal(value.journal) : undefined,
		motionKind: typeof value.motionKind === "string" && value.motionKind.length > 0 ? value.motionKind : "generic",
		owner: clone(value.owner),
		phase: value.phase,
		schemaVersion: DYNAMIC_ASSEMBLY_AUTHORITY_SCHEMA,
		snapshot: normalizeDynamicAssemblySnapshot(value.snapshot),
		sourceClaims: normalizeKeys(value.sourceClaims ?? [], "Dynamic assembly source claims"),
		transform: createAssemblyTransform(value.transform)
	};
	if (typeof value.frozenReason === "string" && value.frozenReason.length > 0)
		record.frozenReason = value.frozenReason;
	return record;
}

export function recoveryDisposition(record) {
	record = normalizeDynamicAssemblyAuthorityRecord(record);
	if (["active", "frozen"].includes(record.phase))
		return { action: "restore_projection", record };
	if (record.phase === "retired")
		return { action: "discard", record };
	return { action: "freeze", reason: `recovery_required:${record.phase}:${record.journal?.operation ?? "unknown"}`, record };
}
