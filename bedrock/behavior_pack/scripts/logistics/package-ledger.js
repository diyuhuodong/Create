export const MAX_PACKAGE_ADDRESS_LENGTH = 64;
export const MAX_PACKAGE_SLOTS = 9;

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function assertIdentifier(value, name) {
	if (typeof value !== "string" || value.length === 0)
		throw new TypeError(`${name} must be a non-empty string`);
	return value;
}

function normalizeAddress(value = "") {
	if (typeof value !== "string" || value.length > MAX_PACKAGE_ADDRESS_LENGTH)
		throw new TypeError(`Package addresses must be strings no longer than ${MAX_PACKAGE_ADDRESS_LENGTH} characters`);
	return value.trim();
}

function normalizeContents(contents) {
	if (!Array.isArray(contents) || contents.length > MAX_PACKAGE_SLOTS)
		throw new RangeError(`Packages contain at most ${MAX_PACKAGE_SLOTS} stacks`);
	return contents.map((stack, index) => {
		if (!stack || typeof stack.typeId !== "string" || stack.typeId.length === 0 || !Number.isInteger(stack.count) || stack.count < 1 || stack.count > 64)
			throw new TypeError(`Package stack ${index} requires a type id and a count from one through 64`);
		return clone(stack);
	});
}

function normalizeOwner(owner) {
	if (!owner || typeof owner !== "object" || Array.isArray(owner))
		throw new TypeError("Package owners must be objects");
	const kind = assertIdentifier(owner.kind, "Package owner kind");
	const id = assertIdentifier(owner.id, "Package owner id");
	if (!["escrow", "ledger", "port", "projection"].includes(kind))
		throw new TypeError(`Unsupported package owner kind ${kind}`);
	return { id, kind };
}

function normalizeOrder(value) {
	if (value === undefined)
		return undefined;
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new TypeError("Package order data must be an object");
	if (!Number.isInteger(value.orderId) || value.orderId < 0)
		throw new TypeError("Package order data requires a non-negative order id");
	return clone(value);
}

function normalizeRecord(value) {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new TypeError("Package records must be objects");
	if (!Number.isInteger(value.revision) || value.revision < 0)
		throw new TypeError("Package revisions must be non-negative integers");
	const record = {
		address: normalizeAddress(value.address),
		contents: normalizeContents(value.contents),
		id: assertIdentifier(value.id, "Package id"),
		owner: normalizeOwner(value.owner),
		receipts: Array.isArray(value.receipts) ? [...new Set(value.receipts.map(receipt => assertIdentifier(receipt, "Package receipt")))].sort() : [],
		revision: value.revision
	};
	const order = normalizeOrder(value.order);
	if (order)
		record.order = order;
	if (value.transfer !== undefined) {
		if (!value.transfer || typeof value.transfer !== "object" || Array.isArray(value.transfer))
			throw new TypeError("Package transfers must be objects");
		record.transfer = {
			from: normalizeOwner(value.transfer.from),
			receiptId: assertIdentifier(value.transfer.receiptId, "Package transfer receipt"),
			to: normalizeOwner(value.transfer.to)
		};
		if (record.owner.kind !== "escrow")
			throw new TypeError("Packages in transfer must be owned by escrow");
	}
	return record;
}

export class PackageLedger {
	#nextId = 1;
	#records = new Map();

	create({ address = "", contents, id, order, owner = { id: "ledger", kind: "ledger" } }) {
		id ??= `package:${this.#nextId++}`;
		if (this.#records.has(id))
			throw new Error(`Package ${id} already exists`);
		const record = normalizeRecord({ address, contents, id, order, owner, revision: 0 });
		this.#records.set(id, record);
		return clone(record);
	}

	get(id) {
		const record = this.#records.get(assertIdentifier(id, "Package id"));
		return record && clone(record);
	}

	beginTransfer(id, { expectedRevision, receiptId, to }) {
		const record = this.#require(id);
		if (!Number.isInteger(expectedRevision) || expectedRevision !== record.revision)
			return { ok: false, reason: "stale_revision" };
		receiptId = assertIdentifier(receiptId, "Package transfer receipt");
		const existingReceipt = record.receipts.includes(receiptId);
		if (existingReceipt)
			return { ok: true, record: clone(record), replay: true };
		if (record.transfer)
			return { ok: false, reason: "transfer_active" };
		const destination = normalizeOwner(to);
		const source = record.owner;
		record.owner = { id: `escrow:${record.id}:${receiptId}`, kind: "escrow" };
		record.receipts.push(receiptId);
		record.transfer = { from: source, receiptId, to: destination };
		record.revision++;
		return { ok: true, record: clone(record), replay: false };
	}

	completeTransfer(id, { receiptId }) {
		const record = this.#require(id);
		receiptId = assertIdentifier(receiptId, "Package transfer receipt");
		if (!record.receipts.includes(receiptId))
			return { ok: false, reason: "unknown_receipt" };
		if (!record.transfer)
			return { ok: true, record: clone(record), replay: true };
		if (record.transfer.receiptId !== receiptId)
			return { ok: false, reason: "different_transfer_active" };
		record.owner = record.transfer.to;
		delete record.transfer;
		record.revision++;
		return { ok: true, record: clone(record), replay: false };
	}

	update(id, { address, expectedRevision, order }) {
		const record = this.#require(id);
		if (!Number.isInteger(expectedRevision) || expectedRevision !== record.revision)
			return { ok: false, reason: "stale_revision" };
		if (record.transfer)
			return { ok: false, reason: "transfer_active" };
		if (address !== undefined)
			record.address = normalizeAddress(address);
		if (order !== undefined) {
			const normalized = normalizeOrder(order);
			if (normalized)
				record.order = normalized;
			else
				delete record.order;
		}
		record.revision++;
		return { ok: true, record: clone(record) };
	}

	snapshot() {
		return { nextId: this.#nextId, records: [...this.#records.values()].map(clone).sort((left, right) => left.id.localeCompare(right.id)) };
	}

	restore(snapshot) {
		if (!snapshot || !Number.isInteger(snapshot.nextId) || snapshot.nextId < 1 || !Array.isArray(snapshot.records))
			throw new TypeError("Package ledger snapshots require a next id and record array");
		const restored = new Map();
		for (const value of snapshot.records) {
			const record = normalizeRecord(value);
			if (restored.has(record.id))
				throw new TypeError(`Duplicate package ${record.id}`);
			restored.set(record.id, record);
		}
		this.#nextId = snapshot.nextId;
		this.#records = restored;
	}

	#require(id) {
		const record = this.#records.get(assertIdentifier(id, "Package id"));
		if (!record)
			throw new Error(`Unknown package ${id}`);
		return record;
	}
}
