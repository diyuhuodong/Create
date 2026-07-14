import { cloneFluidStack } from "./fluid-stack.js";

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function assertPartition(partition) {
	if (typeof partition !== "string" || partition.length === 0)
		throw new TypeError("Fluid transfer records require a persistent partition");
	return partition;
}

function validateRecord(record) {
	if (!record || typeof record.id !== "string" || typeof record.sourceId !== "string" || typeof record.destinationId !== "string")
		throw new TypeError("Fluid transfer records require identifiers");
	assertPartition(record.partition);
	if (record.state !== "intent" && record.state !== "escrowed")
		throw new TypeError("Fluid transfer records require an intent or escrow state");
	if (record.state === "intent" && !record.reservation)
		throw new TypeError("Fluid transfer intents require a source reservation");
	if (record.state === "escrowed") {
		cloneFluidStack(record.fluid);
		if (!Number.isSafeInteger(record.deliveryAttempt) || record.deliveryAttempt < 0)
			throw new TypeError("Escrowed fluid transfers require a delivery attempt");
		if (record.delivery !== undefined) {
			if (!record.delivery || typeof record.delivery.escrowId !== "string" || record.delivery.escrowId.length === 0 || typeof record.delivery.transactionId !== "string" || record.delivery.transactionId.length === 0)
				throw new TypeError("Fluid delivery escrow records require stable identifiers");
			cloneFluidStack(record.delivery.fluid);
		}
	}
}

export function fluidTransferPartition(id, partitionCount = 64) {
	if (typeof id !== "string" || id.length === 0)
		throw new TypeError("Fluid transfer partitions require an identifier");
	if (!Number.isInteger(partitionCount) || partitionCount < 1)
		throw new RangeError("Fluid transfer partition counts must be positive integers");

	let hash = 0x811c9dc5;
	for (let index = 0; index < id.length; index++) {
		hash ^= id.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return `fluid-transaction:${(hash >>> 0) % partitionCount}`;
}

export class FluidTransferJournal {
	#completedTransfers = [];
	#records = new Map();

	begin({ destination, id, maxAmount, partition = fluidTransferPartition(id), predicate, source }) {
		if (typeof id !== "string" || id.length === 0)
			throw new TypeError("Fluid transfers require an identifier");
		if (this.#records.has(id))
			throw new Error(`Fluid transfer ${id} already exists`);
		if (!source || !destination)
			throw new TypeError("Fluid transfers require source and destination ports");
		const reservation = source.reserve({ maxAmount, predicate, transactionId: id });
		if (!reservation)
			return { ok: false, reason: "source_empty" };
		const record = {
			destinationId: destination.id,
			id,
			partition: assertPartition(partition),
			reservation,
			sourceId: source.id,
			state: "intent"
		};
		this.#records.set(id, record);
		return { ok: true, record: clone(record) };
	}

	hasSource(sourceId) {
		if (typeof sourceId !== "string" || sourceId.length === 0)
			throw new TypeError("Fluid transfer source identifiers must be non-empty strings");
		return [...this.#records.values()].some(record => record.sourceId === sourceId);
	}

	extract(id, resolvePort) {
		const record = this.#records.get(id);
		if (!record)
			return { ok: false, reason: "unknown_transfer" };
		if (record.state === "escrowed")
			return { ok: true, state: "escrowed" };

		const source = resolvePort(record.sourceId);
		if (!source)
			return { ok: false, reason: "source_missing", state: "intent" };
		try {
			record.fluid = source.extract(record.reservation, { receiptId: `${id}:extract` });
			record.deliveryAttempt = 0;
			record.state = "escrowed";
			return { ok: true, state: "escrowed" };
		} catch (error) {
			if (error?.transactionState === "uncertain")
				return { ok: false, reason: "source_uncertain", state: "intent", error: String(error) };
			if (error?.transactionState === "retry")
				return { ok: false, reason: "source_retry", state: "intent", error: String(error) };
			this.#records.delete(id);
			return { ok: false, reason: "source_changed", error: String(error) };
		}
	}

	deliver(id, resolvePort) {
		const record = this.#records.get(id);
		if (!record)
			return { ok: false, reason: "unknown_transfer" };
		if (record.state !== "escrowed")
			return { ok: false, reason: "not_escrowed", state: "intent" };

		const destination = resolvePort(record.destinationId);
		if (!destination)
			return { ok: false, reason: "destination_missing", state: "escrowed" };
		if (record.delivery === undefined && typeof destination.prepareDelivery === "function") {
			try {
				const delivery = destination.prepareDelivery({
					fluid: cloneFluidStack(record.fluid),
					sourceReservation: clone(record.reservation),
					transactionId: record.id
				});
				if (delivery !== undefined) {
					if (!delivery || typeof delivery.escrowId !== "string" || delivery.escrowId.length === 0 || typeof delivery.transactionId !== "string" || delivery.transactionId.length === 0)
						throw new TypeError("Fluid delivery preparation returned invalid escrow metadata");
					record.delivery = clone(delivery);
					return { ok: true, state: "delivery_intent" };
				}
			} catch (error) {
				if (error?.transactionState === "uncertain")
					return { ok: false, reason: "destination_uncertain", state: "escrowed", error: String(error) };
				if (error?.transactionState === "retry")
					return { ok: false, reason: "destination_retry", state: "escrowed", error: String(error) };
				return { ok: false, reason: "destination_rejected", state: "escrowed", error: String(error) };
			}
		}
		try {
			const result = destination.insert(record.fluid, {
				delivery: record.delivery,
				receiptId: `${id}:deliver:${record.deliveryAttempt}`,
				sourceReservation: record.reservation,
				transactionId: id
			});
			if (result.remainder) {
				record.fluid = result.remainder;
				record.deliveryAttempt++;
				return { ok: false, reason: "destination_full", state: "escrowed" };
			}
			const committed = clone(record);
			this.#records.delete(id);
			this.#completedTransfers.push(committed);
			return { ok: true, state: "committed" };
		} catch (error) {
			if (error?.transactionState === "uncertain")
				return { ok: false, reason: "destination_uncertain", state: "escrowed", error: String(error) };
			if (error?.transactionState === "retry")
				return { ok: false, reason: "destination_retry", state: "escrowed", error: String(error) };
			return { ok: false, reason: "destination_rejected", state: "escrowed", error: String(error) };
		}
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
		const result = source.insert(record.fluid, { receiptId: `${id}:rollback` });
		if (result.remainder) {
			record.fluid = result.remainder;
			return { ok: false, reason: "source_full", state: "escrowed" };
		}
		this.#records.delete(id);
		return { ok: true, state: "rolled_back" };
	}

	restore(records) {
		if (!Array.isArray(records))
			throw new TypeError("Fluid transfer journals restore arrays");
		const restored = new Map();
		for (const record of records) {
			const normalized = {
				...record,
				partition: record?.partition ?? fluidTransferPartition(record?.id)
			};
			validateRecord(normalized);
			if (restored.has(normalized.id))
				throw new Error(`Fluid transfer journal contains duplicate ${normalized.id}`);
			restored.set(normalized.id, clone(normalized));
		}
		this.#records = restored;
		this.#completedTransfers = [];
	}

	settle(id, resolvePort) {
		const record = this.#records.get(id);
		if (!record)
			return { ok: false, reason: "unknown_transfer" };
		if (record.state === "intent") {
			const extracted = this.extract(id, resolvePort);
			if (!extracted.ok)
				return extracted;
		}
		return this.deliver(id, resolvePort);
	}

	stateOf(id) {
		const record = this.#records.get(id);
		return record?.state;
	}

	takeCompletedTransfers() {
		const completed = this.#completedTransfers.map(clone);
		this.#completedTransfers = [];
		return completed;
	}

	snapshot() {
		return [...this.#records.values()].map(clone).sort((left, right) => left.id.localeCompare(right.id));
	}
}
