import { cloneFluidStack, fluidReservationFingerprint, fluidStackFingerprint } from "./fluid-stack.js";

function cloneReceiptEntries(entries, mapReceipt) {
	return [...entries].map(([receiptId, receipt]) => [receiptId, mapReceipt(receipt)]).sort(([left], [right]) => left.localeCompare(right));
}

function assertReceiptId(receiptId, operation) {
	if (typeof receiptId !== "string" || receiptId.length === 0)
		throw new TypeError(`Fluid ${operation} receipts require an identifier`);
}

export class FluidTank {
	#contents;
	#capacity;
	#extractionReceipts = new Map();
	#id;
	#insertionReceipts = new Map();
	#revision = 0;

	constructor({ capacity, contents, id }) {
		if (typeof id !== "string" || id.length === 0)
			throw new TypeError("Fluid tanks require an identifier");
		if (!Number.isSafeInteger(capacity) || capacity < 1)
			throw new RangeError("Fluid tanks require a positive safe-integer capacity");
		const normalized = contents === undefined ? undefined : cloneFluidStack(contents);
		if (normalized && normalized.amount > capacity)
			throw new RangeError("Initial fluid contents cannot exceed tank capacity");
		this.#capacity = capacity;
		this.#contents = normalized;
		this.#id = id;
	}

	get capacity() {
		return this.#capacity;
	}

	get id() {
		return this.#id;
	}

	inspect() {
		return {
			capacity: this.#capacity,
			contents: this.#contents && cloneFluidStack(this.#contents),
			id: this.#id,
			revision: this.#revision
		};
	}

	insert(fluid, { receiptId } = {}) {
		const requested = cloneFluidStack(fluid);
		if (receiptId !== undefined) {
			assertReceiptId(receiptId, "insertion");
			const existing = this.#insertionReceipts.get(receiptId);
			if (existing) {
				if (existing.fingerprint !== fluidStackFingerprint(requested) || existing.requestedAmount !== requested.amount)
					throw new Error(`Insertion receipt ${receiptId} was reused with another fluid stack`);
				return this.#insertResult(requested, existing.acceptedAmount);
			}
		}

		const compatible = !this.#contents || fluidStackFingerprint(this.#contents) === fluidStackFingerprint(requested);
		const acceptedAmount = compatible ? Math.min(this.#capacity - (this.#contents?.amount ?? 0), requested.amount) : 0;
		if (acceptedAmount > 0) {
			if (this.#contents)
				this.#contents.amount += acceptedAmount;
			else
				this.#contents = { ...requested, amount: acceptedAmount };
			this.#revision++;
		}
		if (receiptId !== undefined)
			this.#insertionReceipts.set(receiptId, {
				acceptedAmount,
				fingerprint: fluidStackFingerprint(requested),
				requestedAmount: requested.amount
			});
		return this.#insertResult(requested, acceptedAmount);
	}

	extract(reservation, { receiptId } = {}) {
		if (!reservation || reservation.tankId !== this.#id)
			throw new Error("Fluid reservation belongs to another tank");
		if (receiptId !== undefined) {
			assertReceiptId(receiptId, "extraction");
			const existing = this.#extractionReceipts.get(receiptId);
			if (existing) {
				if (existing.reservationFingerprint !== fluidReservationFingerprint(reservation))
					throw new Error(`Extraction receipt ${receiptId} was reused with another reservation`);
				return cloneFluidStack(existing.fluid);
			}
		}
		if (reservation.revision !== this.#revision)
			throw new Error("Fluid reservation is stale");
		const fluid = cloneFluidStack(reservation.fluid);
		if (!this.#contents || fluidStackFingerprint(this.#contents) !== fluidStackFingerprint(fluid) || this.#contents.amount < fluid.amount)
			throw new Error("Fluid reservation no longer matches the source tank");

		this.#contents.amount -= fluid.amount;
		if (this.#contents.amount === 0)
			this.#contents = undefined;
		this.#revision++;
		if (receiptId !== undefined)
			this.#extractionReceipts.set(receiptId, {
				fluid: cloneFluidStack(fluid),
				reservationFingerprint: fluidReservationFingerprint(reservation)
			});
		return fluid;
	}

	reserve({ maxAmount = Number.MAX_SAFE_INTEGER, predicate = () => true } = {}) {
		if (!Number.isSafeInteger(maxAmount) || maxAmount < 1)
			throw new RangeError("Fluid reservation limits must be positive safe integers");
		if (typeof predicate !== "function")
			throw new TypeError("Fluid reservation predicates must be functions");
		if (!this.#contents || !predicate(cloneFluidStack(this.#contents)))
			return undefined;
		return {
			fluid: { ...this.#contents, amount: Math.min(this.#contents.amount, maxAmount) },
			revision: this.#revision,
			tankId: this.#id
		};
	}

	restore(snapshot) {
		if (!snapshot || snapshot.id !== this.#id || snapshot.capacity !== this.#capacity || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0)
			throw new TypeError("Fluid tank snapshot is incompatible with this tank");
		if (!Array.isArray(snapshot.extractionReceipts) || !Array.isArray(snapshot.insertionReceipts))
			throw new TypeError("Fluid tank snapshots require receipt records");
		const contents = snapshot.contents === undefined ? undefined : cloneFluidStack(snapshot.contents);
		if (contents && contents.amount > this.#capacity)
			throw new RangeError("Fluid tank snapshot exceeds capacity");

		const extractionReceipts = new Map();
		for (const [receiptId, receipt] of snapshot.extractionReceipts) {
			assertReceiptId(receiptId, "extraction");
			if (typeof receipt?.reservationFingerprint !== "string")
				throw new TypeError("Fluid tank extraction receipts are invalid");
			extractionReceipts.set(receiptId, {
				fluid: cloneFluidStack(receipt.fluid),
				reservationFingerprint: receipt.reservationFingerprint
			});
		}
		const insertionReceipts = new Map();
		for (const [receiptId, receipt] of snapshot.insertionReceipts) {
			assertReceiptId(receiptId, "insertion");
			if (typeof receipt?.fingerprint !== "string" || !Number.isSafeInteger(receipt.acceptedAmount) || !Number.isSafeInteger(receipt.requestedAmount) || receipt.acceptedAmount < 0 || receipt.requestedAmount < receipt.acceptedAmount)
				throw new TypeError("Fluid tank insertion receipts are invalid");
			insertionReceipts.set(receiptId, { ...receipt });
		}
		this.#contents = contents;
		this.#extractionReceipts = extractionReceipts;
		this.#insertionReceipts = insertionReceipts;
		this.#revision = snapshot.revision;
	}

	snapshot() {
		return {
			capacity: this.#capacity,
			contents: this.#contents && cloneFluidStack(this.#contents),
			extractionReceipts: cloneReceiptEntries(this.#extractionReceipts, receipt => ({
				fluid: cloneFluidStack(receipt.fluid),
				reservationFingerprint: receipt.reservationFingerprint
			})),
			id: this.#id,
			insertionReceipts: cloneReceiptEntries(this.#insertionReceipts, receipt => ({ ...receipt })),
			revision: this.#revision
		};
	}

	#insertResult(requested, acceptedAmount) {
		return {
			accepted: acceptedAmount === 0 ? undefined : { ...requested, amount: acceptedAmount },
			remainder: acceptedAmount === requested.amount ? undefined : { ...requested, amount: requested.amount - acceptedAmount }
		};
	}
}
