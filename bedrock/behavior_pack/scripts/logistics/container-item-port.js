import { cloneItemStack, itemStackFingerprint } from "./item-port.js";

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function assertReceiptId(receiptId, operation) {
	if (typeof receiptId !== "string" || receiptId.length === 0)
		throw new TypeError(`${operation} receipts require an identifier`);
}

function assertReservation(reservation, portId) {
	if (!reservation || reservation.portId !== portId || !Array.isArray(reservation.slots) || reservation.slots.length !== 1)
		throw new Error("Container item reservations must contain exactly one local slot");
	const entry = reservation.slots[0];
	if (!Number.isInteger(entry?.slot) || !Number.isInteger(entry?.count) || entry.count < 1)
		throw new Error("Container item reservations contain an invalid slot");
	return entry;
}

function sameStack(left, right) {
	if (left === undefined || right === undefined)
		return left === right;
	return left.count === right.count && itemStackFingerprint(left) === itemStackFingerprint(right);
}

export class UncertainContainerStateError extends Error {
	transactionState = "uncertain";
}

export class ContainerItemPort {
	#codec;
	#container;
	#extractionReceipts = new Map();
	#id;
	#insertionReceipts = new Map();
	#maxStackSize;
	#revision = 0;

	constructor({ codec, container, id, maxStackSize = 64 }) {
		if (!container || !Number.isInteger(container.size) || container.size < 1 || typeof container.getItem !== "function" || typeof container.setItem !== "function")
			throw new TypeError("Container item ports require a readable writable container");
		if (!codec || typeof codec.decode !== "function" || typeof codec.create !== "function" || typeof codec.withCount !== "function")
			throw new TypeError("Container item ports require decode, create, and withCount codecs");
		if (typeof id !== "string" || id.length === 0)
			throw new TypeError("Container item ports require an identifier");
		if (!Number.isInteger(maxStackSize) || maxStackSize < 1)
			throw new RangeError("Container item ports require a positive stack limit");
		this.#codec = codec;
		this.#container = container;
		this.#id = id;
		this.#maxStackSize = maxStackSize;
	}

	get id() {
		return this.#id;
	}

	extract(reservation, { receiptId } = {}) {
		const entry = assertReservation(reservation, this.#id);
		if (receiptId !== undefined) {
			assertReceiptId(receiptId, "Container item extraction");
			const previous = this.#extractionReceipts.get(receiptId);
			if (previous) {
				if (previous.reservationFingerprint !== JSON.stringify(reservation))
					throw new Error(`Container extraction receipt ${receiptId} was reused with another reservation`);
				return cloneItemStack(previous.stack);
			}
		}
		if (reservation.revision !== this.#revision)
			throw new Error("Container item reservation is stale");
		const before = this.#read(entry.slot);
		if (!before || itemStackFingerprint(before.stack) !== itemStackFingerprint(reservation.item) || before.stack.count < entry.count || entry.count !== reservation.item.count)
			throw new Error("Container item reservation no longer matches the source slot");

		const expected = entry.count === before.stack.count
			? undefined
			: { ...before.stack, count: before.stack.count - entry.count };
		let writeError;
		try {
			this.#container.setItem(entry.slot, expected === undefined ? undefined : this.#codec.withCount(before.physical, expected.count));
		} catch (error) {
			writeError = error;
		}
		let after;
		try {
			after = this.#read(entry.slot)?.stack;
		} catch (error) {
			throw new UncertainContainerStateError(`Cannot verify container extraction: ${error}`);
		}
		if (!sameStack(after, expected)) {
			try {
				this.#container.setItem(entry.slot, before.physical);
				if (!sameStack(this.#read(entry.slot)?.stack, before.stack))
					throw new Error("rollback did not restore the source slot");
			} catch (rollbackError) {
				throw new UncertainContainerStateError(`Container extraction rollback failed: ${rollbackError}`);
			}
			throw new Error(`Container extraction was rejected: ${writeError ?? "unexpected slot state"}`);
		}

		const extracted = cloneItemStack(reservation.item);
		this.#revision++;
		if (receiptId !== undefined)
			this.#extractionReceipts.set(receiptId, {
				reservationFingerprint: JSON.stringify(reservation),
				stack: extracted
			});
		return extracted;
	}

	insert(stack, { receiptId } = {}) {
		const requested = cloneItemStack(stack);
		if (receiptId !== undefined) {
			assertReceiptId(receiptId, "Container item insertion");
			const previous = this.#insertionReceipts.get(receiptId);
			if (previous) {
				if (previous.fingerprint !== itemStackFingerprint(requested) || previous.requestedCount !== requested.count)
					throw new Error(`Container insertion receipt ${receiptId} was reused with another item stack`);
				return this.#insertResult(requested, previous.acceptedCount);
			}
		}

		let acceptedCount = 0;
		let stopped = false;
		for (const occupied of [true, false]) {
			for (let slot = 0; slot < this.#container.size && !stopped && acceptedCount < requested.count; slot++) {
				const before = this.#read(slot);
				if (occupied && (!before || itemStackFingerprint(before.stack) !== itemStackFingerprint(requested)))
					continue;
				if (!occupied && before)
					continue;
				const limit = this.#stackLimit(before, requested);
				const capacity = limit - (before?.stack.count ?? 0);
				if (capacity < 1)
					continue;
				const count = Math.min(capacity, requested.count - acceptedCount);
				const desired = { ...requested, count: (before?.stack.count ?? 0) + count };
				const result = this.#insertSlot(slot, before, desired, count);
				acceptedCount += result.acceptedCount;
				stopped = result.stopped;
			}
		}

		if (acceptedCount > 0)
			this.#revision++;
		if (receiptId !== undefined)
			this.#insertionReceipts.set(receiptId, {
				acceptedCount,
				fingerprint: itemStackFingerprint(requested),
				requestedCount: requested.count
			});
		return this.#insertResult(requested, acceptedCount);
	}

	inspect() {
		return {
			id: this.#id,
			revision: this.#revision,
			slots: Array.from({ length: this.#container.size }, (_, slot) => this.#read(slot)?.stack)
		};
	}

	reserve({ maxCount = Number.MAX_SAFE_INTEGER, predicate = () => true } = {}) {
		if (!Number.isInteger(maxCount) || maxCount < 1)
			throw new RangeError("Container item reservation limits must be positive integers");
		if (typeof predicate !== "function")
			throw new TypeError("Container item reservation predicates must be functions");
		for (let slot = 0; slot < this.#container.size; slot++) {
			const entry = this.#read(slot);
			if (!entry || !predicate(cloneItemStack(entry.stack)))
				continue;
			const item = { ...entry.stack, count: Math.min(entry.stack.count, maxCount) };
			return {
				item,
				portId: this.#id,
				revision: this.#revision,
				slots: [{ count: item.count, slot }]
			};
		}
		return undefined;
	}

	restore(snapshot) {
		if (!snapshot || snapshot.id !== this.#id || !Number.isInteger(snapshot.revision) || snapshot.revision < 0 || !Array.isArray(snapshot.extractionReceipts) || !Array.isArray(snapshot.insertionReceipts))
			throw new TypeError("Container item port snapshot is incompatible");
		const extractionReceipts = new Map();
		for (const [receiptId, receipt] of snapshot.extractionReceipts) {
			assertReceiptId(receiptId, "Container item extraction");
			if (typeof receipt?.reservationFingerprint !== "string")
				throw new TypeError("Container item extraction receipt is invalid");
			extractionReceipts.set(receiptId, {
				reservationFingerprint: receipt.reservationFingerprint,
				stack: cloneItemStack(receipt.stack)
			});
		}
		const insertionReceipts = new Map();
		for (const [receiptId, receipt] of snapshot.insertionReceipts) {
			assertReceiptId(receiptId, "Container item insertion");
			if (typeof receipt?.fingerprint !== "string" || !Number.isInteger(receipt.acceptedCount) || !Number.isInteger(receipt.requestedCount))
				throw new TypeError("Container item insertion receipt is invalid");
			insertionReceipts.set(receiptId, { ...receipt });
		}
		this.#revision = snapshot.revision;
		this.#extractionReceipts = extractionReceipts;
		this.#insertionReceipts = insertionReceipts;
	}

	snapshot() {
		return {
			extractionReceipts: [...this.#extractionReceipts.entries()].map(([receiptId, receipt]) => [receiptId, {
				reservationFingerprint: receipt.reservationFingerprint,
				stack: cloneItemStack(receipt.stack)
			}]),
			id: this.#id,
			insertionReceipts: [...this.#insertionReceipts.entries()].map(([receiptId, receipt]) => [receiptId, { ...receipt }]),
			revision: this.#revision
		};
	}

	#insertResult(requested, acceptedCount) {
		return {
			accepted: acceptedCount === 0 ? undefined : { ...requested, count: acceptedCount },
			remainder: acceptedCount === requested.count ? undefined : { ...requested, count: requested.count - acceptedCount }
		};
	}

	#insertSlot(slot, before, desired, requestedCount) {
		let writeError;
		try {
			const value = before
				? this.#codec.withCount(before.physical, desired.count)
				: this.#codec.create(desired);
			this.#container.setItem(slot, value);
		} catch (error) {
			writeError = error;
		}
		let after;
		try {
			after = this.#read(slot)?.stack;
		} catch (error) {
			throw new UncertainContainerStateError(`Cannot verify container insertion: ${error}`);
		}
		if (sameStack(after, desired))
			return { acceptedCount: requestedCount, stopped: false };
		const originalCount = before?.stack.count ?? 0;
		const acceptedCount = after && itemStackFingerprint(after) === itemStackFingerprint(desired)
			? Math.min(requestedCount, Math.max(0, after.count - originalCount))
			: 0;
		if (writeError || acceptedCount !== requestedCount)
			return { acceptedCount, stopped: true };
		throw new UncertainContainerStateError("Container insertion produced an unexpected slot state");
	}

	#read(slot) {
		const physical = this.#container.getItem(slot);
		if (!physical)
			return undefined;
		return { physical, stack: cloneItemStack(this.#codec.decode(physical)) };
	}

	#stackLimit(before, requested) {
		const limit = this.#codec.maxAmount?.(before?.physical, requested) ?? this.#maxStackSize;
		if (!Number.isInteger(limit) || limit < 1)
			throw new TypeError("Container item codecs must return a positive stack limit");
		return limit;
	}
}
