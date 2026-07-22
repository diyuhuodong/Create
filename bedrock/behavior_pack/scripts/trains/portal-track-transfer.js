export const PORTAL_TRANSFER_SCHEMA_VERSION = 2;
export const PORTAL_TRANSFER_READABLE_SCHEMAS = Object.freeze([1, PORTAL_TRANSFER_SCHEMA_VERSION]);

const PHASES = ["destination_reserved", "authority_switched", "projection_built", "frozen"];

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }

function endpoint(value, label) {
	if (!value || typeof value.dimensionId !== "string" || typeof value.nodeId !== "string" || ![value.location?.x, value.location?.y, value.location?.z].every(Number.isFinite))
		throw new TypeError(`${label} requires dimension, node, and location`);
	return { dimensionId: value.dimensionId, location: { ...value.location }, nodeId: value.nodeId };
}

function normalizeRecord(value) {
	if (!value || !PORTAL_TRANSFER_READABLE_SCHEMAS.includes(value.schemaVersion) || typeof value.id !== "string" || typeof value.trainId !== "string" || !PHASES.includes(value.phase))
		throw new TypeError("Invalid Portal Track transfer record");
	const resumePhase = value.phase === "frozen" && value.schemaVersion >= 2 && PHASES.includes(value.resumePhase) && value.resumePhase !== "frozen" ? value.resumePhase : undefined;
	return { destination: endpoint(value.destination, "Portal destination"), id: value.id, payload: clone(value.payload), phase: value.phase, schemaVersion: PORTAL_TRANSFER_SCHEMA_VERSION, source: endpoint(value.source, "Portal source"), trainId: value.trainId, ...(value.frozenReason ? { frozenReason: String(value.frozenReason) } : {}), ...(resumePhase ? { resumePhase } : {}) };
}

export class PortalTrackTransferAuthority {
	#port;
	#transfers = new Map();

	constructor(port) {
		for (const method of ["reserveDestination", "switchAuthority", "rebuildProjection", "releaseEntrance"])
			if (typeof port?.[method] !== "function")
				throw new TypeError(`Portal transfer ports require ${method}()`);
		this.#port = port;
	}

	begin({ destination, id, payload, source, trainId }) {
		if (typeof id !== "string" || id.length === 0 || typeof trainId !== "string" || trainId.length === 0 || this.#transfers.has(id))
			throw new TypeError("Portal transfers require unique transfer and train ids");
		const record = { destination: endpoint(destination, "Portal destination"), id, payload: clone(payload), phase: "destination_reserved", schemaVersion: PORTAL_TRANSFER_SCHEMA_VERSION, source: endpoint(source, "Portal source"), trainId };
		if (this.#port.reserveDestination(clone(record)) === false)
			return { ok: false, reason: "destination_unavailable" };
		this.#transfers.set(id, record);
		this.#port.checkpoint?.(clone(record));
		return { ok: true, record: clone(record) };
	}

	advance(id) {
		const record = this.#transfers.get(id);
		if (!record)
			throw new Error(`Unknown Portal Track transfer ${id}`);
		if (record.phase === "frozen")
			return { complete: false, record: clone(record) };
		try {
			if (record.phase === "destination_reserved") {
				if (this.#port.switchAuthority(clone(record)) === false)
					throw new Error("authority switch rejected");
				record.phase = "authority_switched";
				this.#port.checkpoint?.(clone(record));
				return { complete: false, record: clone(record) };
			}
			if (record.phase === "authority_switched") {
				if (this.#port.rebuildProjection(clone(record)) === false)
					throw new Error("destination projection unavailable");
				record.phase = "projection_built";
				this.#port.checkpoint?.(clone(record));
				return { complete: false, record: clone(record) };
			}
			if (this.#port.releaseEntrance(clone(record)) === false)
				throw new Error("entrance release rejected");
			this.#transfers.delete(id);
			this.#port.complete?.(clone(record));
			return { complete: true };
		} catch (error) {
			record.resumePhase = record.phase;
			record.phase = "frozen";
			record.frozenReason = `portal_transfer_failed:${error}`;
			this.#port.checkpoint?.(clone(record));
			return { complete: false, record: clone(record) };
		}
	}

	retry(id) {
		const record = this.#transfers.get(id);
		if (!record)
			throw new Error(`Unknown Portal Track transfer ${id}`);
		if (record.phase !== "frozen" || !record.resumePhase)
			return { ok: false, reason: record.phase === "frozen" ? "manual_recovery_required" : "not_frozen" };
		record.phase = record.resumePhase;
		delete record.resumePhase;
		delete record.frozenReason;
		this.#port.checkpoint?.(clone(record));
		return { ok: true, record: clone(record) };
	}

	restore(records) {
		if (!Array.isArray(records))
			throw new TypeError("Portal transfer restore requires records");
		const restored = records.map(normalizeRecord);
		if (new Set(restored.map(record => record.id)).size !== restored.length || new Set(restored.map(record => record.trainId)).size !== restored.length)
			throw new Error("Portal transfer records cannot duplicate transfers or trains");
		for (const record of restored)
			this.#transfers.set(record.id, record);
	}

	snapshot() {
		return [...this.#transfers.values()].map(clone).sort((left, right) => left.id.localeCompare(right.id));
	}
}
