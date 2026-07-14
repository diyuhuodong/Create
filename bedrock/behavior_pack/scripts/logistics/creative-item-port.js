import { cloneItemStack, itemStackFingerprint } from "./item-port.js";

/**
 * A managed source port for the Creative Crate. It never consumes its
 * template, while still issuing revisioned reservations and idempotent
 * extraction receipts so it is safe to use with the normal transfer journal.
 */
export class CreativeItemPort {
	#extractionReceipts = new Map();
	#id;
	#revision = 0;
	#template;

	constructor({ id, template } = {}) {
		if (typeof id !== "string" || id.length === 0)
			throw new TypeError("Creative item ports require an identifier");
		this.#id = id;
		this.#template = template === undefined ? undefined : cloneItemStack(template);
	}

	get id() {
		return this.#id;
	}

	get transactionStorage() {
		return "managed";
	}

	setTemplate(template) {
		const normalized = template === undefined ? undefined : cloneItemStack(template);
		if ((normalized === undefined && this.#template === undefined)
			|| (normalized && this.#template && itemStackFingerprint(normalized) === itemStackFingerprint(this.#template) && normalized.count === this.#template.count))
			return false;
		this.#template = normalized;
		this.#revision++;
		this.#extractionReceipts.clear();
		return true;
	}

	reserve({ maxCount = Number.MAX_SAFE_INTEGER, predicate = () => true } = {}) {
		if (!Number.isInteger(maxCount) || maxCount < 1 || typeof predicate !== "function")
			throw new TypeError("Creative item reservations require a positive limit and predicate");
		if (!this.#template || !predicate(cloneItemStack(this.#template)))
			return undefined;
		return {
			creative: true,
			item: { ...this.#template, count: Math.min(maxCount, this.#template.count) },
			portId: this.#id,
			revision: this.#revision,
			slots: [{ count: Math.min(maxCount, this.#template.count), slot: 0 }]
		};
	}

	extract(reservation, { receiptId } = {}) {
		if (!reservation?.creative || !reservation.item || reservation.portId !== this.#id || reservation.revision !== this.#revision)
			throw new Error("Creative item reservation is invalid or stale");
		if (receiptId !== undefined && (typeof receiptId !== "string" || receiptId.length === 0))
			throw new TypeError("Creative item extraction receipts require identifiers");
		const expected = this.reserve({ maxCount: reservation.item?.count, predicate: stack => itemStackFingerprint(stack) === itemStackFingerprint(reservation.item) });
		if (!expected || expected.item.count !== reservation.item.count)
			throw new Error("Creative item reservation no longer matches its template");
		const existing = receiptId && this.#extractionReceipts.get(receiptId);
		if (existing)
			return cloneItemStack(existing);
		const extracted = cloneItemStack(reservation.item);
		if (receiptId)
			this.#extractionReceipts.set(receiptId, extracted);
		return extracted;
	}

	previewInsert(stack) {
		return { accepted: undefined, remainder: cloneItemStack(stack) };
	}

	insert(stack) {
		return this.previewInsert(stack);
	}

	rollback(stack) {
		return { accepted: cloneItemStack(stack), remainder: undefined };
	}

	inspect() {
		return { id: this.#id, revision: this.#revision, template: this.#template && cloneItemStack(this.#template) };
	}

	restore(snapshot) {
		if (!snapshot || snapshot.id !== this.#id || snapshot.kind !== "creative" || !Number.isInteger(snapshot.revision) || snapshot.revision < 0 || !Array.isArray(snapshot.extractionReceipts))
			throw new TypeError("Creative item-port snapshot is incompatible");
		this.#template = snapshot.template === undefined || snapshot.template === null ? undefined : cloneItemStack(snapshot.template);
		this.#revision = snapshot.revision;
		this.#extractionReceipts = new Map(snapshot.extractionReceipts.map(entry => {
			if (!Array.isArray(entry) || typeof entry[0] !== "string")
				throw new TypeError("Creative item-port extraction receipts are invalid");
			return [entry[0], cloneItemStack(entry[1])];
		}));
	}

	snapshot() {
		return {
			extractionReceipts: [...this.#extractionReceipts.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([id, item]) => [id, cloneItemStack(item)]),
			id: this.#id,
			kind: "creative",
			revision: this.#revision,
			template: this.#template && cloneItemStack(this.#template)
		};
	}
}
