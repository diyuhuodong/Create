function cloneMetadata(metadata) {
	if (metadata === undefined)
		return undefined;
	return JSON.parse(stableStringify(metadata));
}

function normalizeStack(stack) {
	if (!stack || typeof stack.typeId !== "string" || stack.typeId.length === 0)
		throw new TypeError("Item stacks require a type identifier");
	if (!Number.isInteger(stack.count) || stack.count < 1)
		throw new RangeError("Item stack counts must be positive integers");
	return {
		count: stack.count,
		...(stack.metadata === undefined ? {} : { metadata: cloneMetadata(stack.metadata) }),
		typeId: stack.typeId
	};
}

function stableStringify(value) {
	if (value === null || typeof value !== "object")
		return JSON.stringify(value);
	if (Array.isArray(value))
		return `[${value.map(stableStringify).join(",")}]`;
	return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

export function cloneItemStack(stack) {
	return normalizeStack(stack);
}

export function itemStackFingerprint(stack) {
	const normalized = normalizeStack(stack);
	return stableStringify({ metadata: normalized.metadata ?? null, typeId: normalized.typeId });
}

export class ItemPort {
	#extractionReceipts = new Map();
	#id;
	#insertionReceipts = new Map();
	#maxStackSize;
	#revision = 0;
	#slots;

	constructor({ id, maxStackSize = 64, size, slots = [] }) {
		if (typeof id !== "string" || id.length === 0)
			throw new TypeError("Item ports require an identifier");
		if (!Number.isInteger(size) || size < 1)
			throw new RangeError("Item ports require a positive slot count");
		if (!Number.isInteger(maxStackSize) || maxStackSize < 1)
			throw new RangeError("Item ports require a positive stack limit");
		if (!Array.isArray(slots) || slots.length > size)
			throw new RangeError("Item port initial slots exceed its capacity");

		this.#id = id;
		this.#maxStackSize = maxStackSize;
		this.#slots = Array.from({ length: size }, (_, index) => {
			const stack = slots[index];
			if (stack === undefined)
				return undefined;
			const normalized = normalizeStack(stack);
			if (normalized.count > maxStackSize)
				throw new RangeError("Initial item stacks cannot exceed the port stack limit");
			return normalized;
		});
	}

	get id() {
		return this.#id;
	}

	get transactionStorage() {
		return "managed";
	}

	insert(stack, { receiptId } = {}) {
		const requested = normalizeStack(stack);
		if (receiptId !== undefined) {
			if (typeof receiptId !== "string" || receiptId.length === 0)
				throw new TypeError("Item insertion receipts require an identifier");
			const existing = this.#insertionReceipts.get(receiptId);
			if (existing) {
				if (existing.fingerprint !== itemStackFingerprint(requested) || existing.requestedCount !== requested.count)
					throw new Error(`Insertion receipt ${receiptId} was reused with another item stack`);
				return this.#insertResult(requested, existing.acceptedCount);
			}
		}

		let remaining = requested.count;
		for (const existing of this.#slots) {
			if (!existing || itemStackFingerprint(existing) !== itemStackFingerprint(requested))
				continue;
			const accepted = Math.min(this.#maxStackSize - existing.count, remaining);
			if (accepted <= 0)
				continue;
			existing.count += accepted;
			remaining -= accepted;
		}
		for (let slot = 0; slot < this.#slots.length && remaining > 0; slot++) {
			if (this.#slots[slot])
				continue;
			const accepted = Math.min(this.#maxStackSize, remaining);
			this.#slots[slot] = { ...requested, count: accepted };
			remaining -= accepted;
		}

		const acceptedCount = requested.count - remaining;
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

	previewInsert(stack) {
		const requested = normalizeStack(stack);
		let remaining = requested.count;
		for (const existing of this.#slots) {
			if (!existing || itemStackFingerprint(existing) !== itemStackFingerprint(requested))
				continue;
			remaining -= Math.min(this.#maxStackSize - existing.count, remaining);
		}
		for (const existing of this.#slots) {
			if (existing || remaining === 0)
				continue;
			remaining -= Math.min(this.#maxStackSize, remaining);
		}
		return this.#insertResult(requested, requested.count - remaining);
	}

	compactReceipts() {
		const removed = this.#extractionReceipts.size + this.#insertionReceipts.size;
		this.#extractionReceipts.clear();
		this.#insertionReceipts.clear();
		return removed;
	}

	extract(reservation, { receiptId } = {}) {
		if (!reservation || reservation.portId !== this.#id)
			throw new Error("Item reservation belongs to another port");
		if (receiptId !== undefined) {
			if (typeof receiptId !== "string" || receiptId.length === 0)
				throw new TypeError("Item extraction receipts require an identifier");
			const existing = this.#extractionReceipts.get(receiptId);
			if (existing) {
				if (existing.reservationFingerprint !== stableStringify(reservation))
					throw new Error(`Extraction receipt ${receiptId} was reused with another reservation`);
				return cloneItemStack(existing.stack);
			}
		}
		if (reservation.revision !== this.#revision)
			throw new Error("Item reservation is stale");
		if (!Array.isArray(reservation.slots) || reservation.slots.length === 0)
			throw new Error("Item reservation must contain slots");

		const fingerprint = itemStackFingerprint(reservation.item);
		let requested = 0;
		for (const entry of reservation.slots) {
			const stack = this.#slots[entry?.slot];
			if (!Number.isInteger(entry?.slot) || !Number.isInteger(entry?.count) || entry.count < 1 || !stack || itemStackFingerprint(stack) !== fingerprint || stack.count < entry.count)
				throw new Error("Item reservation no longer matches the source port");
			requested += entry.count;
		}
		if (requested !== reservation.item.count)
			throw new Error("Item reservation count is invalid");

		for (const entry of reservation.slots) {
			const stack = this.#slots[entry.slot];
			stack.count -= entry.count;
			if (stack.count === 0)
				this.#slots[entry.slot] = undefined;
		}
		this.#revision++;
		const extracted = cloneItemStack(reservation.item);
		if (receiptId !== undefined)
			this.#extractionReceipts.set(receiptId, {
				reservationFingerprint: stableStringify(reservation),
				stack: extracted
			});
		return extracted;
	}

	reserve({ maxCount = Number.MAX_SAFE_INTEGER, predicate = () => true } = {}) {
		if (!Number.isInteger(maxCount) || maxCount < 1)
			throw new RangeError("Item reservation limits must be positive integers");
		if (typeof predicate !== "function")
			throw new TypeError("Item reservation predicates must be functions");

		let item;
		let fingerprint;
		let remaining = maxCount;
		const slots = [];
		for (let slot = 0; slot < this.#slots.length && remaining > 0; slot++) {
			const stack = this.#slots[slot];
			if (!stack || !predicate(cloneItemStack(stack)))
				continue;
			const stackFingerprint = itemStackFingerprint(stack);
			if (fingerprint !== undefined && fingerprint !== stackFingerprint)
				continue;
			fingerprint = stackFingerprint;
			item ??= { ...stack, count: 0 };
			const count = Math.min(stack.count, remaining);
			slots.push({ count, slot });
			item.count += count;
			remaining -= count;
		}
		if (!item)
			return undefined;
		return {
			item,
			portId: this.#id,
			revision: this.#revision,
			slots
		};
	}

	inspect() {
		return {
			id: this.#id,
			revision: this.#revision,
			slots: this.#slots.map(stack => stack && cloneItemStack(stack))
		};
	}

	rollback(stack, options = {}) {
		return this.insert(stack, options);
	}

	restore(snapshot) {
		if (!snapshot || snapshot.id !== this.#id || snapshot.maxStackSize !== this.#maxStackSize || !Number.isInteger(snapshot.revision) || snapshot.revision < 0 || !Array.isArray(snapshot.slots) || snapshot.slots.length !== this.#slots.length)
			throw new TypeError("Item port snapshot is incompatible with this port");
		if (!Array.isArray(snapshot.extractionReceipts) || !Array.isArray(snapshot.insertionReceipts))
			throw new TypeError("Item port snapshots require receipt records");

		const extractionReceipts = new Map();
		for (const [receiptId, receipt] of snapshot.extractionReceipts) {
			if (typeof receiptId !== "string" || typeof receipt?.reservationFingerprint !== "string")
				throw new TypeError("Item port extraction receipts are invalid");
			extractionReceipts.set(receiptId, {
				reservationFingerprint: receipt.reservationFingerprint,
				stack: cloneItemStack(receipt.stack)
			});
		}
		const insertionReceipts = new Map();
		for (const [receiptId, receipt] of snapshot.insertionReceipts) {
			if (typeof receiptId !== "string" || typeof receipt?.fingerprint !== "string" || !Number.isInteger(receipt.acceptedCount) || !Number.isInteger(receipt.requestedCount))
				throw new TypeError("Item port insertion receipts are invalid");
			insertionReceipts.set(receiptId, { ...receipt });
		}
		// JSON persistence represents sparse/undefined array entries as null.
		// Normalize both forms so a restored managed port retains the same empty
		// slot semantics as an in-memory port.
		this.#slots = snapshot.slots.map(stack => stack === undefined || stack === null ? undefined : cloneItemStack(stack));
		this.#revision = snapshot.revision;
		this.#extractionReceipts = extractionReceipts;
		this.#insertionReceipts = insertionReceipts;
	}

	snapshot() {
		return {
			extractionReceipts: [...this.#extractionReceipts.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([receiptId, receipt]) => [receiptId, {
				reservationFingerprint: receipt.reservationFingerprint,
				stack: cloneItemStack(receipt.stack)
			}]),
			id: this.#id,
			insertionReceipts: [...this.#insertionReceipts.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([receiptId, receipt]) => [receiptId, { ...receipt }]),
			maxStackSize: this.#maxStackSize,
			revision: this.#revision,
			slots: this.#slots.map(stack => stack && cloneItemStack(stack))
		};
	}

	#insertResult(requested, acceptedCount) {
		return {
			accepted: acceptedCount === 0 ? undefined : { ...requested, count: acceptedCount },
			remainder: acceptedCount === requested.count ? undefined : { ...requested, count: requested.count - acceptedCount }
		};
	}
}
