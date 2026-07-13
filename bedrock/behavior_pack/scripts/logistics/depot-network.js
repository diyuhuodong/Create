import { ShardedStateStore } from "../kernel/sharded-state-store.js";
import { cloneItemStack, ItemPort } from "./item-port.js";
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
	#belts = new Map();
	#cooldownTicks = 0;
	#depots = new Map();
	#journal = new ItemTransferJournal();
	#onError;
	#retryIntervalTicks;
	#store;
	#transports = new Map();
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
				if (record.kind === "belt")
					return `belt:${record.id}`;
				if (record.kind === "transport")
					return `belt:${record.beltId}`;
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

	createBelt({ destinationId, id, length, sourceId, speed = 0 }) {
		if (typeof id !== "string" || id.length === 0)
			throw new TypeError("Belts require an identifier");
		if (this.#belts.has(id))
			throw new Error(`Belt ${id} already exists`);
		if (!Number.isFinite(length) || length <= 0)
			throw new RangeError("Belts require a positive length");
		if (!Number.isFinite(speed))
			throw new TypeError("Belt speeds must be finite");
		this.#requireDepot(sourceId);
		this.#requireDepot(destinationId);
		this.#belts.set(id, { destinationId, id, length, nextTransport: 0, sourceId, speed });
		this.#persist();
		return id;
	}

	canRemoveDepot(id) {
		const depot = this.#depots.get(id);
		if (!depot)
			return true;
		if (this.#journal.snapshot().some(record => record.sourceId === id || record.destinationId === id))
			return false;
		if ([...this.#belts.values()].some(belt => belt.sourceId === id || belt.destinationId === id))
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
			belts: this.#belts.size,
			cooldownTicks: this.#cooldownTicks,
			depots: this.#depots.size,
			transfers: this.#journal.snapshot().length,
			transports: this.#transports.size,
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

	removeBelt(id) {
		if (this.#transports.size > 0 && [...this.#transports.values()].some(transport => transport.beltId === id))
			throw new Error(`Belt ${id} has an active transport`);
		if (!this.#belts.delete(id))
			return false;
		this.#persist();
		return true;
	}

	restore() {
		const restored = this.#store.read();
		if (!restored)
			return { depots: 0, transfers: 0, warnings: [] };
		const belts = [];
		const depots = new Map();
		const transfers = [];
		const transports = [];
		for (const record of restored.records) {
			try {
				if (record?.kind === "transfer") {
					transfers.push(this.#transferFromRecord(record));
					continue;
				}
				if (record?.kind === "belt") {
					belts.push(record);
					continue;
				}
				if (record?.kind === "transport") {
					transports.push(record);
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
		const restoredBelts = new Map();
		for (const record of belts) {
			try {
				const belt = this.#beltFromRecord(record, depots);
				if (restoredBelts.has(belt.id))
					throw new Error(`duplicate belt ${belt.id}`);
				restoredBelts.set(belt.id, belt);
			} catch (error) {
				this.#report(new Error(`Ignored invalid belt record: ${error}`));
			}
		}
		const restoredTransports = new Map();
		for (const record of transports) {
			try {
				const transport = this.#transportFromRecord(record, restoredBelts, depots);
				if (restoredTransports.has(transport.id))
					throw new Error(`duplicate transport ${transport.id}`);
				restoredTransports.set(transport.id, transport);
			} catch (error) {
				this.#report(new Error(`Ignored invalid belt transport record: ${error}`));
			}
		}
		this.#journal.restore(transfers);
		this.#belts = restoredBelts;
		this.#depots = depots;
		this.#transports = restoredTransports;
		for (const warning of restored.warnings)
			this.#report(new Error(`Ignored corrupt depot shard ${warning.partition}: ${warning.error}`));
		return { belts: restoredBelts.size, depots: depots.size, transfers: transfers.length, transports: restoredTransports.size, warnings: restored.warnings };
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
		if (this.#tickTransfer())
			return true;
		return this.#tickBelt() || wrote;
	}

	setBeltSpeed(id, speed) {
		if (!Number.isFinite(speed))
			throw new TypeError("Belt speeds must be finite");
		const belt = this.#belts.get(id);
		if (!belt)
			throw new Error(`Unknown belt ${id}`);
		if (belt.speed === speed)
			return false;
		belt.speed = speed;
		this.#persist();
		return true;
	}

	#beltFromRecord(record, depots) {
		if (record?.kind !== "belt" || typeof record.id !== "string" || record.id.length === 0 || typeof record.sourceId !== "string" || typeof record.destinationId !== "string")
			throw new TypeError("Belt records require identifiers");
		if (!Number.isFinite(record.length) || record.length <= 0 || !Number.isFinite(record.speed) || !Number.isInteger(record.nextTransport) || record.nextTransport < 0)
			throw new TypeError("Belt records require valid length, speed, and sequence state");
		if (!depots.has(record.sourceId) || !depots.has(record.destinationId))
			throw new Error("Belt endpoints must refer to restored depots");
		return {
			destinationId: record.destinationId,
			id: record.id,
			length: record.length,
			nextTransport: record.nextTransport,
			sourceId: record.sourceId,
			speed: record.speed
		};
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

	#launchBeltTransport() {
		for (const belt of [...this.#belts.values()].sort((left, right) => left.id.localeCompare(right.id))) {
			if (belt.speed === 0 || [...this.#transports.values()].some(transport => transport.beltId === belt.id))
				continue;
			const sourceId = belt.speed > 0 ? belt.sourceId : belt.destinationId;
			const destinationId = belt.speed > 0 ? belt.destinationId : belt.sourceId;
			const source = this.#depots.get(sourceId)?.port;
			if (!source)
				continue;
			const reservation = source.reserve();
			if (!reservation)
				continue;
			const sequence = belt.nextTransport++;
			const id = `${belt.id}:${sequence}`;
			const item = source.extract(reservation, { receiptId: `belt:${belt.id}:extract:${sequence}` });
			this.#transports.set(id, {
				attempt: 0,
				beltId: belt.id,
				destinationId,
				forward: belt.speed > 0,
				id,
				item,
				progress: 0,
				sourceId
			});
			this.#persist();
			return true;
		}
		return false;
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
		const belts = [...this.#belts.values()]
			.map(belt => ({ ...belt, kind: "belt" }))
			.sort((left, right) => left.id.localeCompare(right.id));
		const transfers = this.#journal.snapshot().map(record => ({ ...record, kind: "transfer" }));
		const transports = [...this.#transports.values()]
			.map(transport => ({ ...transport, item: cloneItemStack(transport.item), kind: "transport" }))
			.sort((left, right) => left.id.localeCompare(right.id));
		return [...depots, ...belts, ...transfers, ...transports];
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

	#tickBelt() {
		const transport = [...this.#transports.values()].sort((left, right) => left.id.localeCompare(right.id))[0];
		if (!transport)
			return this.#launchBeltTransport();
		const belt = this.#belts.get(transport.beltId);
		if (!belt) {
			this.#report(new Error(`Transport ${transport.id} has no belt`));
			return false;
		}
		const speed = Math.abs(belt.speed);
		if (speed === 0)
			return false;
		const distance = Math.min(1, speed / (belt.length * 32));
		const movesForward = (belt.speed > 0) === transport.forward;
		transport.progress = Math.max(0, Math.min(1, transport.progress + (movesForward ? distance : -distance)));
		if (transport.progress > 0 && transport.progress < 1) {
			this.#persist();
			return true;
		}
		const endpointId = transport.progress === 1 ? transport.destinationId : transport.sourceId;
		const destination = this.#depots.get(endpointId)?.port;
		if (!destination) {
			this.#report(new Error(`Transport ${transport.id} has no endpoint depot`));
			return false;
		}
		const operation = transport.progress === 1 ? "deliver" : "return";
		const result = destination.insert(transport.item, { receiptId: `belt:${transport.id}:${operation}:${transport.attempt}` });
		if (result.remainder) {
			transport.attempt++;
			transport.item = result.remainder;
			this.#cooldownTicks = this.#retryIntervalTicks;
		} else
			this.#transports.delete(transport.id);
		this.#persist();
		return true;
	}

	#tickTransfer() {
		const record = this.#journal.snapshot()[0];
		if (!record)
			return false;
		const result = record.state === "intent"
			? this.#journal.extract(record.id, id => this.#depots.get(id)?.port)
			: this.#journal.deliver(record.id, id => this.#depots.get(id)?.port);
		if (result.ok || result.reason === "destination_full" || result.reason === "source_changed")
			this.#persist();
		if (!result.ok)
			this.#cooldownTicks = this.#retryIntervalTicks;
		return true;
	}

	#transportFromRecord(record, belts, depots) {
		if (record?.kind !== "transport" || typeof record.id !== "string" || typeof record.beltId !== "string" || typeof record.sourceId !== "string" || typeof record.destinationId !== "string" || typeof record.forward !== "boolean")
			throw new TypeError("Belt transport records require identifiers");
		if (!Number.isInteger(record.attempt) || record.attempt < 0 || !Number.isFinite(record.progress) || record.progress < 0 || record.progress > 1)
			throw new TypeError("Belt transport records require valid progress and attempt state");
		if (!belts.has(record.beltId) || !depots.has(record.sourceId) || !depots.has(record.destinationId))
			throw new Error("Belt transport endpoints must refer to restored records");
		return {
			attempt: record.attempt,
			beltId: record.beltId,
			destinationId: record.destinationId,
			forward: record.forward,
			id: record.id,
			item: cloneItemStack(record.item),
			progress: record.progress,
			sourceId: record.sourceId
		};
	}
}
