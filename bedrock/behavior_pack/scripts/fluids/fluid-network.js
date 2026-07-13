import { FluidTransferJournal } from "./fluid-transfer-journal.js";

function assertLinkId(id) {
	if (typeof id !== "string" || id.length === 0)
		throw new TypeError("Fluid links require an identifier");
	return id;
}

function assertPositiveAmount(amount, description) {
	if (!Number.isSafeInteger(amount) || amount < 1)
		throw new RangeError(`${description} must be a positive safe integer`);
	return amount;
}

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function validatePort(port) {
	if (!port || typeof port.id !== "string" || port.id.length === 0 || typeof port.insert !== "function" || typeof port.reserve !== "function" || typeof port.extract !== "function")
		throw new TypeError("Fluid networks require reserve/extract/insert port endpoints");
	return port;
}

function validateLink(record) {
	if (!record || (record.kind !== "pipe" && record.kind !== "pump"))
		throw new TypeError("Fluid network links require a pipe or pump kind");
	assertLinkId(record.id);
	if (typeof record.sourceId !== "string" || typeof record.destinationId !== "string")
		throw new TypeError("Fluid links require source and destination identifiers");
	assertPositiveAmount(record.maxAmountPerTick, "Fluid link transfer limits");
	if (typeof record.enabled !== "boolean" || !Number.isSafeInteger(record.nextTransfer) || record.nextTransfer < 0)
		throw new TypeError("Fluid link state is invalid");
	if (record.activeTransferId !== undefined && (typeof record.activeTransferId !== "string" || record.activeTransferId.length === 0))
		throw new TypeError("Fluid link active transfer identifiers are invalid");
	return record;
}

export class FluidNetwork {
	#dirtyLinks = new Set();
	#journal = new FluidTransferJournal();
	#links = new Map();
	#ports = new Map();
	#roundRobinAfter;
	#transfersPerTick;

	constructor({ transfersPerTick = 8 } = {}) {
		assertPositiveAmount(transfersPerTick, "Fluid network transfer budgets");
		this.#transfersPerTick = transfersPerTick;
	}

	createPipe({ destinationId, id, maxAmountPerTick = 250, open = true, sourceId }) {
		return this.#createLink({ destinationId, enabled: open, id, kind: "pipe", maxAmountPerTick, sourceId });
	}

	createPump({ destinationId, id, maxAmountPerTick = 250, running = true, sourceId }) {
		return this.#createLink({ destinationId, enabled: running, id, kind: "pump", maxAmountPerTick, sourceId });
	}

	diagnostics() {
		return {
			activeTransfers: this.#journal.snapshot().length,
			dirtyLinks: this.#dirtyLinks.size,
			links: this.#links.size,
			ports: this.#ports.size
		};
	}

	markLinkDirty(id) {
		this.#requireLink(id);
		this.#dirtyLinks.add(id);
	}

	markPortDirty(id) {
		this.#requirePort(id);
		for (const link of this.#links.values()) {
			if (link.sourceId === id || link.destinationId === id)
				this.#dirtyLinks.add(link.id);
		}
	}

	registerPort(port) {
		const endpoint = validatePort(port);
		const existing = this.#ports.get(endpoint.id);
		if (existing && existing !== endpoint)
			throw new Error(`Fluid port ${endpoint.id} is already registered`);
		this.#ports.set(endpoint.id, endpoint);
		this.markPortDirty(endpoint.id);
		return endpoint.id;
	}

	removeLink(id) {
		const link = this.#requireLink(id);
		if (link.activeTransferId)
			throw new Error(`Fluid link ${id} has an active transfer`);
		this.#dirtyLinks.delete(id);
		this.#links.delete(id);
		return true;
	}

	removePort(id) {
		this.#requirePort(id);
		if ([...this.#links.values()].some(link => link.sourceId === id || link.destinationId === id))
			throw new Error(`Fluid port ${id} is still connected`);
		this.#ports.delete(id);
		return true;
	}

	restore(snapshot) {
		if (!snapshot || !Array.isArray(snapshot.links) || !Array.isArray(snapshot.transfers) || (snapshot.roundRobinAfter !== undefined && typeof snapshot.roundRobinAfter !== "string"))
			throw new TypeError("Fluid network snapshots require links and transfer records");
		const links = new Map();
		for (const entry of snapshot.links) {
			const link = validateLink(clone(entry));
			this.#requirePort(link.sourceId);
			this.#requirePort(link.destinationId);
			if (links.has(link.id))
				throw new Error(`Fluid network snapshot contains duplicate link ${link.id}`);
			links.set(link.id, link);
		}
		const journal = new FluidTransferJournal();
		journal.restore(snapshot.transfers);
		const transferIds = new Set(journal.snapshot().map(record => record.id));
		for (const link of links.values()) {
			if (link.activeTransferId && !transferIds.delete(link.activeTransferId))
				throw new Error(`Fluid link ${link.id} references a missing transfer`);
		}
		if (transferIds.size > 0)
			throw new Error("Fluid network snapshot contains an unowned transfer");
		this.#journal = journal;
		this.#links = links;
		this.#dirtyLinks = new Set([...links.values()].filter(link => link.enabled || link.activeTransferId).map(link => link.id));
		this.#roundRobinAfter = snapshot.roundRobinAfter;
	}

	setPipeOpen(id, open) {
		const link = this.#requireKind(id, "pipe");
		if (typeof open !== "boolean")
			throw new TypeError("Pipe valve state must be boolean");
		link.enabled = open;
		this.markLinkDirty(id);
	}

	setPumpRunning(id, running) {
		const link = this.#requireKind(id, "pump");
		if (typeof running !== "boolean")
			throw new TypeError("Pump running state must be boolean");
		link.enabled = running;
		this.markLinkDirty(id);
	}

	snapshot() {
		return {
			links: [...this.#links.values()].map(clone).sort((left, right) => left.id.localeCompare(right.id)),
			roundRobinAfter: this.#roundRobinAfter,
			transfers: this.#journal.snapshot()
		};
	}

	tick({ budget = this.#transfersPerTick } = {}) {
		assertPositiveAmount(budget, "Fluid network tick budgets");
		let processed = 0;
		const outcomes = [];
		for (const id of this.#orderedDirtyLinks()) {
			if (processed >= budget)
				break;
			this.#dirtyLinks.delete(id);
			this.#roundRobinAfter = id;
			const link = this.#links.get(id);
			if (!link || (!link.enabled && !link.activeTransferId))
				continue;
			processed++;
			outcomes.push({ id, ...this.#settleLink(link) });
		}
		return { outcomes, processed };
	}

	#createLink({ destinationId, enabled, id, kind, maxAmountPerTick, sourceId }) {
		assertLinkId(id);
		if (this.#links.has(id))
			throw new Error(`Fluid link ${id} already exists`);
		if (typeof enabled !== "boolean")
			throw new TypeError("Fluid link enabled state must be boolean");
		this.#requirePort(sourceId);
		this.#requirePort(destinationId);
		const link = {
			destinationId,
			enabled,
			id,
			kind,
			maxAmountPerTick: assertPositiveAmount(maxAmountPerTick, "Fluid link transfer limits"),
			nextTransfer: 0,
			sourceId
		};
		this.#links.set(id, link);
		this.markLinkDirty(id);
		return id;
	}

	#requireKind(id, kind) {
		const link = this.#requireLink(id);
		if (link.kind !== kind)
			throw new Error(`Fluid link ${id} is not a ${kind}`);
		return link;
	}

	#requireLink(id) {
		const link = this.#links.get(id);
		if (!link)
			throw new Error(`Unknown fluid link ${id}`);
		return link;
	}

	#requirePort(id) {
		const port = this.#ports.get(id);
		if (!port)
			throw new Error(`Unknown fluid port ${id}`);
		return port;
	}

	#orderedDirtyLinks() {
		const ids = [...this.#dirtyLinks].sort();
		if (!this.#roundRobinAfter || ids.length < 2)
			return ids;
		const firstAfter = ids.findIndex(id => id > this.#roundRobinAfter);
		if (firstAfter === -1)
			return ids;
		return [...ids.slice(firstAfter), ...ids.slice(0, firstAfter)];
	}

	#settleLink(link) {
		if (!link.activeTransferId) {
			const id = `fluid-link:${link.id}:${link.nextTransfer++}`;
			const began = this.#journal.begin({
				destination: this.#requirePort(link.destinationId),
				id,
				maxAmount: link.maxAmountPerTick,
				source: this.#requirePort(link.sourceId)
			});
			if (!began.ok)
				return began;
			link.activeTransferId = id;
		}

		const settled = this.#journal.settle(link.activeTransferId, id => this.#ports.get(id));
		if (settled.ok || settled.reason === "source_changed" || settled.reason === "unknown_transfer") {
			link.activeTransferId = undefined;
			if (settled.ok && link.enabled)
				this.markLinkDirty(link.id);
		}
		return settled;
	}
}
