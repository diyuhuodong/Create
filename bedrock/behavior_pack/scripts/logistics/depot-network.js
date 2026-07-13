import { ShardedStateStore } from "../kernel/sharded-state-store.js";
import { ItemPort } from "./item-port.js";
import { ItemTransferJournal } from "./item-transfer-journal.js";

function assertLocation(location) {
	if (!location || !Number.isInteger(location.x) || !Number.isInteger(location.y) || !Number.isInteger(location.z))
		throw new TypeError("Depot locations require integer x, y, and z coordinates");
	return { x: location.x, y: location.y, z: location.z };
}

function sectionKey(dimensionId, location) {
	return `${dimensionId}:${Math.floor(location.x / 16)}:${Math.floor(location.y / 16)}:${Math.floor(location.z / 16)}`;
}

export function depotId(dimensionId, location) {
	if (typeof dimensionId !== "string" || dimensionId.length === 0)
		throw new TypeError("Depots require a dimension identifier");
	const normalized = assertLocation(location);
	return `depot:${dimensionId}:${normalized.x}:${normalized.y}:${normalized.z}`;
}

export class DepotNetwork {
	#cooldownTicks = 0;
	#depots = new Map();
	#journal = new ItemTransferJournal();
	#onError;
	#retryIntervalTicks;
	#store;
	#waitingForCommit = false;

	constructor({ keyPrefix = "createbedrock:depot_state_v1", onError, retryIntervalTicks = 20, storage, writesPerTick }) {
		if (!Number.isInteger(retryIntervalTicks) || retryIntervalTicks < 1)
			throw new RangeError("Depot networks require a positive retry interval");
		if (onError !== undefined && typeof onError !== "function")
			throw new TypeError("Depot network error handlers must be functions");
		this.#onError = onError ?? (() => {});
		this.#retryIntervalTicks = retryIntervalTicks;
		this.#store = new ShardedStateStore({
			keyPrefix,
			onCommit: () => {
				this.#waitingForCommit = false;
			},
			onError: error => this.#report(error),
			partitionFor(record) {
				if (record.kind === "depot")
					return sectionKey(record.dimensionId, record.location);
				if (record.kind === "transfer")
					return record.partition;
				throw new TypeError("Depot state contains an unknown record kind");
			},
			storage,
			writesPerTick
		});
	}

	beginTransfer({ destinationId, id, maxCount, predicate, sourceId }) {
		const result = this.#journal.begin({
			destination: this.#requireDepot(destinationId).port,
			id,
			maxCount,
			predicate,
			source: this.#requireDepot(sourceId).port
		});
		if (result.ok)
			this.#persist();
		return result;
	}

	canRemoveDepot(id) {
		const depot = this.#depots.get(id);
		if (!depot)
			return true;
		if (this.#journal.snapshot().some(record => record.sourceId === id || record.destinationId === id))
			return false;
		return depot.port.snapshot().slots.every(stack => stack === undefined);
	}

	createDepot({ dimensionId, location, maxStackSize = 64, size = 1 }) {
		const id = depotId(dimensionId, location);
		const existing = this.#depots.get(id);
		if (existing)
			return id;
		const depot = {
			dimensionId,
			location: assertLocation(location),
			port: new ItemPort({ id, maxStackSize, size })
		};
		this.#depots.set(id, depot);
		this.#persist();
		return id;
	}

	diagnostics() {
		return {
			cooldownTicks: this.#cooldownTicks,
			depots: this.#depots.size,
			transfers: this.#journal.snapshot().length,
			waitingForCommit: this.#waitingForCommit,
			...this.#store.diagnostics()
		};
	}

	extract(depotIdentifier, options) {
		const port = this.#requireDepot(depotIdentifier).port;
		const reservation = port.reserve(options);
		if (!reservation)
			return undefined;
		const extracted = port.extract(reservation);
		this.#persist();
		return extracted;
	}

	insert(depotIdentifier, stack, options) {
		const result = this.#requireDepot(depotIdentifier).port.insert(stack, options);
		if (result.accepted)
			this.#persist();
		return result;
	}

	removeDepot(id) {
		if (!this.canRemoveDepot(id))
			throw new Error(`Depot ${id} is not empty or has an active item transfer`);
		if (!this.#depots.delete(id))
			return false;
		this.#persist();
		return true;
	}

	restore() {
		const restored = this.#store.read();
		if (!restored)
			return { depots: 0, transfers: 0, warnings: [] };
		const depots = new Map();
		const transfers = [];
		for (const record of restored.records) {
			try {
				if (record?.kind === "transfer") {
					transfers.push(this.#transferFromRecord(record));
					continue;
				}
				const depot = this.#depotFromRecord(record);
				if (depots.has(depot.port.id))
					throw new Error(`duplicate depot ${depot.port.id}`);
				depots.set(depot.port.id, depot);
			} catch (error) {
				this.#report(new Error(`Ignored invalid depot record: ${error}`));
			}
		}
		this.#journal.restore(transfers);
		this.#depots = depots;
		for (const warning of restored.warnings)
			this.#report(new Error(`Ignored corrupt depot shard ${warning.partition}: ${warning.error}`));
		return { depots: depots.size, transfers: transfers.length, warnings: restored.warnings };
	}

	snapshot() {
		return this.#records();
	}

	tick() {
		const wrote = this.#store.tick();
		if (this.#waitingForCommit)
			return wrote;
		if (this.#cooldownTicks > 0) {
			this.#cooldownTicks--;
			return wrote;
		}
		const record = this.#journal.snapshot()[0];
		if (!record)
			return wrote;
		const result = record.state === "intent"
			? this.#journal.extract(record.id, id => this.#depots.get(id)?.port)
			: this.#journal.deliver(record.id, id => this.#depots.get(id)?.port);
		if (result.ok || result.reason === "destination_full" || result.reason === "source_changed")
			this.#persist();
		if (!result.ok)
			this.#cooldownTicks = this.#retryIntervalTicks;
		return true;
	}

	#depotFromRecord(record) {
		if (record?.kind !== "depot" || typeof record.dimensionId !== "string" || !record.location || !record.port)
			throw new TypeError("Depot records require a dimension, location, and port state");
		const location = assertLocation(record.location);
		const id = depotId(record.dimensionId, location);
		if (record.port.id !== id || !Array.isArray(record.port.slots))
			throw new TypeError("Depot port identity does not match its location");
		const port = new ItemPort({
			id,
			maxStackSize: record.port.maxStackSize,
			size: record.port.slots.length
		});
		port.restore(record.port);
		return { dimensionId: record.dimensionId, location, port };
	}

	#persist() {
		try {
			this.#store.request(this.#records());
			this.#waitingForCommit = true;
		} catch (error) {
			this.#report(error);
		}
	}

	#records() {
		const depots = [...this.#depots.values()]
			.map(depot => ({
				dimensionId: depot.dimensionId,
				kind: "depot",
				location: { ...depot.location },
				port: depot.port.snapshot()
			}))
			.sort((left, right) => left.port.id.localeCompare(right.port.id));
		const transfers = this.#journal.snapshot().map(record => ({ ...record, kind: "transfer" }));
		return [...depots, ...transfers];
	}

	#report(error) {
		this.#onError(error instanceof Error ? error : new Error(String(error)));
	}

	#requireDepot(id) {
		if (typeof id !== "string" || id.length === 0)
			throw new TypeError("Depot operations require an identifier");
		const depot = this.#depots.get(id);
		if (!depot)
			throw new Error(`Unknown depot ${id}`);
		return depot;
	}

	#transferFromRecord(record) {
		if (record?.kind !== "transfer")
			throw new TypeError("Depot transfer records require a transfer kind");
		const { kind, ...transfer } = record;
		return transfer;
	}
}
