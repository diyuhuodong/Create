import { cloneItemStack } from "./item-port.js";

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function validateRecord(record) {
	if (!record || typeof record.id !== "string" || typeof record.sourceId !== "string" || typeof record.destinationId !== "string")
		throw new TypeError("Item transfer records require identifiers");
	if (record.state !== "intent" && record.state !== "escrowed")
		throw new TypeError("Item transfer records require an intent or escrow state");
	if (record.state === "intent" && !record.reservation)
		throw new TypeError("Item transfer intents require a source reservation");
	if (record.state === "escrowed") {
		cloneItemStack(record.item);
		if (!Number.isInteger(record.deliveryAttempt) || record.deliveryAttempt < 0)
			throw new TypeError("Escrowed item transfers require a delivery attempt");
	}
}

export class ItemTransferJournal {
	#records = new Map();

	begin({ destination, id, maxCount, predicate, source }) {
		if (typeof id !== "string" || id.length === 0)
			throw new TypeError("Item transfers require an identifier");
		if (this.#records.has(id))
			throw new Error(`Item transfer ${id} already exists`);
		if (!source || !destination)
			throw new TypeError("Item transfers require source and destination ports");
		const reservation = source.reserve({ maxCount, predicate });
		if (!reservation)
			return { ok: false, reason: "source_empty" };
		const record = {
			destinationId: destination.id,
			id,
			reservation,
			sourceId: source.id,
			state: "intent"
		};
		this.#records.set(id, record);
		return { ok: true, record: clone(record) };
	}

	rollback(id, resolvePort) {
		const record = this.#records.get(id);
		if (!record)
			return { ok: false, reason: "unknown_transfer" };
		if (record.state === "intent") {
			this.#records.delete(id);
			return { ok: true, state: "cancelled" };
		}
		const source = resolvePort(record.sourceId);
		if (!source)
			return { ok: false, reason: "source_missing" };
		const result = source.insert(record.item, { receiptId: `${id}:rollback` });
		if (result.remainder) {
			record.item = result.remainder;
			return { ok: false, reason: "source_full", state: "escrowed" };
		}
		this.#records.delete(id);
		return { ok: true, state: "rolled_back" };
	}

	restore(records) {
		if (!Array.isArray(records))
			throw new TypeError("Item transfer journals restore arrays");
		const restored = new Map();
		for (const record of records) {
			validateRecord(record);
			if (restored.has(record.id))
				throw new Error(`Item transfer journal contains duplicate ${record.id}`);
			restored.set(record.id, clone(record));
		}
		this.#records = restored;
	}

	settle(id, resolvePort) {
		const record = this.#records.get(id);
		if (!record)
			return { ok: false, reason: "unknown_transfer" };
		if (record.state === "intent") {
			const source = resolvePort(record.sourceId);
			if (!source)
				return { ok: false, reason: "source_missing" };
			try {
				record.item = source.extract(record.reservation, { receiptId: `${id}:extract` });
				record.deliveryAttempt = 0;
				record.state = "escrowed";
			} catch (error) {
				this.#records.delete(id);
				return { ok: false, reason: "source_changed", error: String(error) };
			}
		}

		const destination = resolvePort(record.destinationId);
		if (!destination)
			return { ok: false, reason: "destination_missing", state: "escrowed" };
		const result = destination.insert(record.item, { receiptId: `${id}:deliver:${record.deliveryAttempt}` });
		if (result.remainder) {
			record.item = result.remainder;
			record.deliveryAttempt++;
			return { ok: false, reason: "destination_full", state: "escrowed" };
		}
		this.#records.delete(id);
		return { ok: true, state: "committed" };
	}

	snapshot() {
		return [...this.#records.values()].map(clone).sort((left, right) => left.id.localeCompare(right.id));
	}
}
