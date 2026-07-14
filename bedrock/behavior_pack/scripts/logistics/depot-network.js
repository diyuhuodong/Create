import { ShardedStateStore } from "../kernel/sharded-state-store.js";
import { ItemFilter } from "./item-filter.js";
import { cloneItemStack, itemStackFingerprint, ItemPort } from "./item-port.js";
import { ItemTransferJournal } from "./item-transfer-journal.js";

function assertLocation(location) {
	if (!location || !Number.isInteger(location.x) || !Number.isInteger(location.y) || !Number.isInteger(location.z))
		throw new TypeError("Depot locations require integer x, y, and z coordinates");
	return { x: location.x, y: location.y, z: location.z };
}

function sectionKey(dimensionId, location) {
	return `${dimensionId}:${Math.floor(location.x / 16)}:${Math.floor(location.y / 16)}:${Math.floor(location.z / 16)}`;
}

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function sameStack(left, right) {
	if (left === undefined || right === undefined)
		return left === right;
	return left.count === right.count && itemStackFingerprint(left) === itemStackFingerprint(right);
}

function assertExternalSource(source) {
	if (!source || typeof source.id !== "string" || source.id.length === 0 || !Number.isInteger(source.slot) || source.slot < 0)
		throw new TypeError("External depot deposits require a stable source identifier and slot");
	if (source.name !== undefined && (typeof source.name !== "string" || source.name.length === 0))
		throw new TypeError("External depot deposit source names must be non-empty strings");
	return {
		id: source.id,
		...(source.name === undefined ? {} : { name: source.name }),
		slot: source.slot
	};
}

function assertExternalContainer(endpoint, name) {
	if (!endpoint?.container || !Number.isInteger(endpoint.container.size) || endpoint.container.size < 1 || typeof endpoint.container.getItem !== "function" || typeof endpoint.container.setItem !== "function")
		throw new TypeError(`${name} requires a readable writable container`);
	return endpoint;
}

function assertExternalCallbacks(callbacks) {
	if (!callbacks || typeof callbacks.decodeStack !== "function" || typeof callbacks.resolveEscrow !== "function" || typeof callbacks.resolveSource !== "function")
		throw new TypeError("External depot deposits require stack decoding and source/escrow resolvers");
	return callbacks;
}

function assertExternalWithdrawalCallbacks(callbacks) {
	if (!callbacks || typeof callbacks.createStack !== "function" || typeof callbacks.decodeStack !== "function" || typeof callbacks.resolveEscrow !== "function" || typeof callbacks.resolveTarget !== "function")
		throw new TypeError("External depot withdrawals require stack creation, decoding, and target/escrow resolvers");
	return callbacks;
}

export function depotId(dimensionId, location) {
	if (typeof dimensionId !== "string" || dimensionId.length === 0)
		throw new TypeError("Depots require a dimension identifier");
	const normalized = assertLocation(location);
	return `depot:${dimensionId}:${normalized.x}:${normalized.y}:${normalized.z}`;
}

export class DepotNetwork {
	#belts = new Map();
	#chutes = new Map();
	#cooldownTicks = 0;
	#depots = new Map();
	#externalDeposits = new Map();
	#externalWithdrawals = new Map();
	#funnels = new Map();
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
				if (record.kind === "funnel")
					return `funnel:${record.id}`;
				if (record.kind === "chute")
					return `chute:${record.id}`;
				if (record.kind === "external_deposit")
					return `external_deposit:${record.id}`;
				if (record.kind === "external_withdrawal")
					return `external_withdrawal:${record.id}`;
				throw new TypeError("Depot state contains an unknown record kind");
			},
			storage,
			writesPerTick
		});
	}

	beginTransfer({ destinationId, id, maxCount, predicate, sourceId }) {
		if (this.#isDepotWithdrawalLocked(sourceId) || this.#isDepotWithdrawalLocked(destinationId))
			return { ok: false, reason: "depot_withdrawal_active" };
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

	beginExternalDeposit({ depotId: destinationId, escrowId, id, item, source }) {
		if (typeof id !== "string" || id.length === 0 || typeof escrowId !== "string" || escrowId.length === 0)
			throw new TypeError("External depot deposits require stable transaction and escrow identifiers");
		if (this.#externalDeposits.has(id))
			throw new Error(`External depot deposit ${id} already exists`);
		if (this.#isDepotWithdrawalLocked(destinationId))
			return { ok: false, reason: "depot_withdrawal_active" };
		const depot = this.#requireDepot(destinationId);
		const normalizedItem = cloneItemStack(item);
		if (depot.port.previewInsert(normalizedItem).remainder)
			return { ok: false, reason: "destination_full" };
		const record = {
			depotId: destinationId,
			escrowId,
			id,
			item: normalizedItem,
			source: assertExternalSource(source),
			state: "intent"
		};
		this.#externalDeposits.set(id, record);
		this.#persist();
		return { ok: true, record: clone(record) };
	}

	beginExternalWithdrawal({ depotId: sourceId, escrowId, id, maxCount = 64, target }) {
		if (typeof id !== "string" || id.length === 0 || typeof escrowId !== "string" || escrowId.length === 0)
			throw new TypeError("External depot withdrawals require stable transaction and escrow identifiers");
		if (this.#externalWithdrawals.has(id))
			throw new Error(`External depot withdrawal ${id} already exists`);
		const depot = this.#requireDepot(sourceId);
		if (this.#isDepotBusy(sourceId))
			return { ok: false, reason: "depot_busy" };
		const reservation = depot.port.reserve({ maxCount });
		if (!reservation)
			return { ok: false, reason: "source_empty" };
		const record = {
			depotId: sourceId,
			escrowId,
			id,
			item: cloneItemStack(reservation.item),
			reservation: clone(reservation),
			state: "intent",
			target: assertExternalSource(target)
		};
		this.#externalWithdrawals.set(id, record);
		this.#persist();
		return { ok: true, record: clone(record) };
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

	hasBelt(id) {
		if (typeof id !== "string" || id.length === 0)
			throw new TypeError("Belt identifiers must be non-empty strings");
		return this.#belts.has(id);
	}

	worldBelts() {
		return [...this.#belts.values()]
			.map(belt => {
				const source = this.#depots.get(belt.sourceId);
				const destination = this.#depots.get(belt.destinationId);
				return source && destination && {
					destination: { dimensionId: destination.dimensionId, location: { ...destination.location } },
					id: belt.id,
					source: { dimensionId: source.dimensionId, location: { ...source.location } }
				};
			})
			.filter(Boolean)
			.sort((left, right) => left.id.localeCompare(right.id));
	}

	createFunnel({ destinationId, filter, id, locked = false, sourceId }) {
		if (typeof id !== "string" || id.length === 0)
			throw new TypeError("Funnels require an identifier");
		if (this.#funnels.has(id))
			return id;
		if (typeof locked !== "boolean")
			throw new TypeError("Funnel lock state must be boolean");
		this.#requireDepot(sourceId);
		this.#requireDepot(destinationId);
		this.#funnels.set(id, {
			destinationId,
			filter: filter instanceof ItemFilter ? filter : new ItemFilter(filter),
			id,
			locked,
			nextTransfer: 0,
			sourceId
		});
		this.#persist();
		return id;
	}

	createChute({ destinationId, id, sourceId }) {
		if (typeof id !== "string" || id.length === 0)
			throw new TypeError("Chutes require an identifier");
		if (this.#chutes.has(id))
			return id;
		this.#requireDepot(sourceId);
		this.#requireDepot(destinationId);
		this.#chutes.set(id, { destinationId, id, nextTransfer: 0, sourceId });
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
		if ([...this.#funnels.values()].some(funnel => funnel.sourceId === id || funnel.destinationId === id))
			return false;
		if ([...this.#chutes.values()].some(chute => chute.sourceId === id || chute.destinationId === id))
			return false;
		if ([...this.#externalDeposits.values()].some(deposit => deposit.depotId === id))
			return false;
		if ([...this.#externalWithdrawals.values()].some(withdrawal => withdrawal.depotId === id))
			return false;
		return depot.port.snapshot().slots.every(stack => stack === undefined);
	}

	canRemoveChute(id) {
		return !this.#journal.snapshot().some(record => record.id.startsWith(`chute:${id}:`));
	}

	canRemoveFunnel(id) {
		return !this.#journal.snapshot().some(record => record.id.startsWith(`funnel:${id}:`));
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
			chutes: this.#chutes.size,
			cooldownTicks: this.#cooldownTicks,
			depots: this.#depots.size,
			externalDeposits: this.#externalDeposits.size,
			externalWithdrawals: this.#externalWithdrawals.size,
			funnels: this.#funnels.size,
			journal: this.#journal.diagnostics(),
			transfers: this.#journal.snapshot().length,
			transports: this.#transports.size,
			waitingForCommit: this.#waitingForCommit,
			...this.#store.diagnostics()
		};
	}

	previewExtraction(depotIdentifier, options) {
		if (this.#isDepotWithdrawalLocked(depotIdentifier))
			return undefined;
		const reservation = this.#requireDepot(depotIdentifier).port.reserve(options);
		return reservation && cloneItemStack(reservation.item);
	}

	extract(depotIdentifier, options) {
		if (this.#isDepotWithdrawalLocked(depotIdentifier))
			throw new Error(`Depot ${depotIdentifier} has an active player withdrawal`);
		const port = this.#requireDepot(depotIdentifier).port;
		const reservation = port.reserve(options);
		if (!reservation)
			return undefined;
		const extracted = port.extract(reservation);
		this.#persist();
		return extracted;
	}

	insert(depotIdentifier, stack, options) {
		if (this.#isDepotWithdrawalLocked(depotIdentifier))
			throw new Error(`Depot ${depotIdentifier} has an active player withdrawal`);
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

	removeFunnel(id) {
		if (!this.canRemoveFunnel(id))
			throw new Error(`Funnel ${id} has an active transfer`);
		if (!this.#funnels.delete(id))
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

	removeChute(id) {
		if (!this.canRemoveChute(id))
			throw new Error(`Chute ${id} has an active transfer`);
		if (!this.#chutes.delete(id))
			return false;
		this.#persist();
		return true;
	}

	restore() {
		const restored = this.#store.read();
		if (!restored)
			return { belts: 0, chutes: 0, depots: 0, funnels: 0, transfers: 0, transports: 0, warnings: [] };
		const belts = [];
		const chutes = [];
		const depots = new Map();
		const externalDeposits = [];
		const externalWithdrawals = [];
		const funnels = [];
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
				if (record?.kind === "funnel") {
					funnels.push(record);
					continue;
				}
				if (record?.kind === "chute") {
					chutes.push(record);
					continue;
				}
				if (record?.kind === "external_deposit") {
					externalDeposits.push(record);
					continue;
				}
				if (record?.kind === "external_withdrawal") {
					externalWithdrawals.push(record);
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
		const restoredFunnels = new Map();
		for (const record of funnels) {
			try {
				const funnel = this.#funnelFromRecord(record, depots);
				if (restoredFunnels.has(funnel.id))
					throw new Error(`duplicate funnel ${funnel.id}`);
				restoredFunnels.set(funnel.id, funnel);
			} catch (error) {
				this.#report(new Error(`Ignored invalid funnel record: ${error}`));
			}
		}
		const restoredChutes = new Map();
		for (const record of chutes) {
			try {
				const chute = this.#chuteFromRecord(record, depots);
				if (restoredChutes.has(chute.id))
					throw new Error(`duplicate chute ${chute.id}`);
				restoredChutes.set(chute.id, chute);
			} catch (error) {
				this.#report(new Error(`Ignored invalid chute record: ${error}`));
			}
		}
		const restoredExternalDeposits = new Map();
		for (const record of externalDeposits) {
			try {
				const deposit = this.#externalDepositFromRecord(record, depots);
				if (restoredExternalDeposits.has(deposit.id))
					throw new Error(`duplicate external depot deposit ${deposit.id}`);
				restoredExternalDeposits.set(deposit.id, deposit);
			} catch (error) {
				this.#report(new Error(`Ignored invalid external depot deposit: ${error}`));
			}
		}
		const restoredExternalWithdrawals = new Map();
		for (const record of externalWithdrawals) {
			try {
				const withdrawal = this.#externalWithdrawalFromRecord(record, depots);
				if (restoredExternalWithdrawals.has(withdrawal.id))
					throw new Error(`duplicate external depot withdrawal ${withdrawal.id}`);
				restoredExternalWithdrawals.set(withdrawal.id, withdrawal);
			} catch (error) {
				this.#report(new Error(`Ignored invalid external depot withdrawal: ${error}`));
			}
		}
		this.#journal.restore(transfers);
		this.#belts = restoredBelts;
		this.#chutes = restoredChutes;
		this.#depots = depots;
		this.#externalDeposits = restoredExternalDeposits;
		this.#externalWithdrawals = restoredExternalWithdrawals;
		this.#funnels = restoredFunnels;
		this.#transports = restoredTransports;
		for (const warning of restored.warnings)
			this.#report(new Error(`Ignored corrupt depot shard ${warning.partition}: ${warning.error}`));
		return { belts: restoredBelts.size, chutes: restoredChutes.size, depots: depots.size, funnels: restoredFunnels.size, transfers: transfers.length, transports: restoredTransports.size, warnings: restored.warnings };
	}

	snapshot() {
		return this.#records();
	}

	tick() {
		const wrote = this.#store.tick();
		// Keep a complete intent checkpoint for one scheduler turn before changing
		// a depot port. Depot state shares this store, so a restart can recover the
		// pre-extraction inventory and the transfer plan together.
		if (wrote || this.#waitingForCommit)
			return wrote;
		if (this.#cooldownTicks > 0) {
			this.#cooldownTicks--;
			return wrote;
		}
		if (this.#tickTransfer())
			return true;
		return this.#tickBelt() || this.#tickFunnel() || this.#tickChute() || wrote;
	}

	tickExternalDeposits(callbacks) {
		if (this.#waitingForCommit)
			return false;
		const record = [...this.#externalDeposits.values()].sort((left, right) => left.id.localeCompare(right.id))[0];
		if (!record)
			return false;
		try {
			return this.#tickExternalDeposit(record, assertExternalCallbacks(callbacks));
		} catch (error) {
			this.#report(new Error(`External depot deposit ${record.id} failed: ${error}`));
			return false;
		}
	}

	tickExternalWithdrawals(callbacks) {
		if (this.#waitingForCommit)
			return false;
		const record = [...this.#externalWithdrawals.values()].sort((left, right) => left.id.localeCompare(right.id))[0];
		if (!record)
			return false;
		try {
			return this.#tickExternalWithdrawal(record, assertExternalWithdrawalCallbacks(callbacks));
		} catch (error) {
			this.#report(new Error(`External depot withdrawal ${record.id} failed: ${error}`));
			return false;
		}
	}

	activeEscrowIds() {
		return new Set([
			...this.#externalDeposits.values(),
			...this.#externalWithdrawals.values()
		].map(record => record.escrowId));
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

	setFunnelLocked(id, locked) {
		if (typeof locked !== "boolean")
			throw new TypeError("Funnel lock state must be boolean");
		const funnel = this.#funnels.get(id);
		if (!funnel)
			throw new Error(`Unknown funnel ${id}`);
		if (funnel.locked === locked)
			return false;
		funnel.locked = locked;
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

	#externalDepositFromRecord(record, depots) {
		if (record?.kind !== "external_deposit" || typeof record.id !== "string" || record.id.length === 0 || typeof record.escrowId !== "string" || record.escrowId.length === 0 || typeof record.depotId !== "string" || !["intent", "escrowed", "depoted", "blocked"].includes(record.state))
			throw new TypeError("External depot deposit records require valid identifiers and state");
		if (!depots.has(record.depotId))
			throw new Error("External depot deposits must refer to restored depots");
		return {
			depotId: record.depotId,
			escrowId: record.escrowId,
			id: record.id,
			item: cloneItemStack(record.item),
			source: assertExternalSource(record.source),
			state: record.state
		};
	}

	#externalWithdrawalFromRecord(record, depots) {
		if (record?.kind !== "external_withdrawal" || typeof record.id !== "string" || record.id.length === 0 || typeof record.escrowId !== "string" || record.escrowId.length === 0 || typeof record.depotId !== "string" || !["intent", "escrowed", "delivered", "blocked"].includes(record.state))
			throw new TypeError("External depot withdrawal records require valid identifiers and state");
		const depot = depots.get(record.depotId);
		if (!depot)
			throw new Error("External depot withdrawals must refer to restored depots");
		const item = cloneItemStack(record.item);
		if (!record.reservation || record.reservation.portId !== depot.port.id || !sameStack(record.reservation.item, item))
			throw new TypeError("External depot withdrawals require a matching source reservation");
		return {
			depotId: record.depotId,
			escrowId: record.escrowId,
			id: record.id,
			item,
			reservation: clone(record.reservation),
			state: record.state,
			target: assertExternalSource(record.target)
		};
	}

	#chuteFromRecord(record, depots) {
		if (record?.kind !== "chute" || typeof record.id !== "string" || record.id.length === 0 || typeof record.sourceId !== "string" || typeof record.destinationId !== "string" || !Number.isInteger(record.nextTransfer) || record.nextTransfer < 0)
			throw new TypeError("Chute records require valid identifiers and state");
		if (!depots.has(record.sourceId) || !depots.has(record.destinationId))
			throw new Error("Chute endpoints must refer to restored depots");
		return {
			destinationId: record.destinationId,
			id: record.id,
			nextTransfer: record.nextTransfer,
			sourceId: record.sourceId
		};
	}

	#funnelFromRecord(record, depots) {
		if (record?.kind !== "funnel" || typeof record.id !== "string" || record.id.length === 0 || typeof record.sourceId !== "string" || typeof record.destinationId !== "string" || typeof record.locked !== "boolean" || !Number.isInteger(record.nextTransfer) || record.nextTransfer < 0)
			throw new TypeError("Funnel records require valid identifiers and state");
		if (!depots.has(record.sourceId) || !depots.has(record.destinationId))
			throw new Error("Funnel endpoints must refer to restored depots");
		return {
			destinationId: record.destinationId,
			filter: new ItemFilter(record.filter),
			id: record.id,
			locked: record.locked,
			nextTransfer: record.nextTransfer,
			sourceId: record.sourceId
		};
	}

	#launchBeltTransport() {
		for (const belt of [...this.#belts.values()].sort((left, right) => left.id.localeCompare(right.id))) {
			if (belt.speed === 0 || [...this.#transports.values()].some(transport => transport.beltId === belt.id))
				continue;
			if (this.#isDepotWithdrawalLocked(belt.sourceId) || this.#isDepotWithdrawalLocked(belt.destinationId))
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
		const funnels = [...this.#funnels.values()]
			.map(funnel => ({
				destinationId: funnel.destinationId,
				filter: funnel.filter.snapshot(),
				id: funnel.id,
				kind: "funnel",
				locked: funnel.locked,
				nextTransfer: funnel.nextTransfer,
				sourceId: funnel.sourceId
			}))
			.sort((left, right) => left.id.localeCompare(right.id));
		const chutes = [...this.#chutes.values()]
			.map(chute => ({ ...chute, kind: "chute" }))
			.sort((left, right) => left.id.localeCompare(right.id));
		const externalDeposits = [...this.#externalDeposits.values()]
			.map(deposit => ({ ...deposit, item: cloneItemStack(deposit.item), kind: "external_deposit", source: clone(deposit.source) }))
			.sort((left, right) => left.id.localeCompare(right.id));
		const externalWithdrawals = [...this.#externalWithdrawals.values()]
			.map(withdrawal => ({ ...withdrawal, item: cloneItemStack(withdrawal.item), kind: "external_withdrawal", reservation: clone(withdrawal.reservation), target: clone(withdrawal.target) }))
			.sort((left, right) => left.id.localeCompare(right.id));
		const transfers = this.#journal.snapshot().map(record => ({ ...record, kind: "transfer" }));
		const transports = [...this.#transports.values()]
			.map(transport => ({ ...transport, item: cloneItemStack(transport.item), kind: "transport" }))
			.sort((left, right) => left.id.localeCompare(right.id));
		return [...depots, ...belts, ...funnels, ...chutes, ...externalDeposits, ...externalWithdrawals, ...transfers, ...transports];
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

	#isDepotBusy(id) {
		return this.#isDepotWithdrawalLocked(id)
			|| this.#journal.snapshot().some(record => record.sourceId === id || record.destinationId === id)
			|| [...this.#transports.values()].some(transport => transport.sourceId === id || transport.destinationId === id)
			|| [...this.#externalDeposits.values()].some(deposit => deposit.depotId === id);
	}

	#isDepotWithdrawalLocked(id) {
		return [...this.#externalWithdrawals.values()].some(withdrawal => withdrawal.depotId === id);
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
		if (this.#isDepotWithdrawalLocked(endpointId))
			return false;
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

	#tickFunnel() {
		for (const funnel of [...this.#funnels.values()].sort((left, right) => left.id.localeCompare(right.id))) {
			if (funnel.locked)
				continue;
			if (this.#isDepotWithdrawalLocked(funnel.sourceId) || this.#isDepotWithdrawalLocked(funnel.destinationId))
				continue;
			const result = this.#journal.begin({
				destination: this.#depots.get(funnel.destinationId)?.port,
				id: `funnel:${funnel.id}:${funnel.nextTransfer}`,
				predicate: stack => funnel.filter.accepts(stack),
				source: this.#depots.get(funnel.sourceId)?.port
			});
			if (!result.ok)
				continue;
			funnel.nextTransfer++;
			this.#persist();
			return true;
		}
		return false;
	}

	#tickChute() {
		for (const chute of [...this.#chutes.values()].sort((left, right) => left.id.localeCompare(right.id))) {
			if (this.#isDepotWithdrawalLocked(chute.sourceId) || this.#isDepotWithdrawalLocked(chute.destinationId))
				continue;
			const result = this.#journal.begin({
				destination: this.#depots.get(chute.destinationId)?.port,
				id: `chute:${chute.id}:${chute.nextTransfer}`,
				source: this.#depots.get(chute.sourceId)?.port
			});
			if (!result.ok)
				continue;
			chute.nextTransfer++;
			this.#persist();
			return true;
		}
		return false;
	}

	#tickExternalDeposit(record, callbacks) {
		const depot = this.#depots.get(record.depotId);
		if (!depot) {
			this.#report(new Error(`External depot deposit ${record.id} has no destination depot`));
			return false;
		}
		const escrow = callbacks.resolveEscrow(record);
		if (!escrow)
			return false;
		assertExternalContainer(escrow, "External depot escrow");
		if (escrow.container.size !== 1)
			throw new Error("External depot escrows must have one slot");
		const escrowStack = this.#readExternalStack(escrow.container, 0, callbacks.decodeStack);

		if (record.state === "intent") {
			if (sameStack(escrowStack, record.item)) {
				record.state = "escrowed";
				this.#persist();
				return true;
			}
			if (escrowStack !== undefined)
				return this.#blockExternalDeposit(record, "escrow is occupied by another item");
			const source = callbacks.resolveSource(record.source);
			if (!source)
				return false;
			assertExternalContainer(source, "External depot source");
			if (!Number.isInteger(source.slot) || source.slot < 0 || source.slot >= source.container.size)
				throw new RangeError("External depot source slot is outside its container");
			const sourceStack = this.#readExternalStack(source.container, source.slot, callbacks.decodeStack);
			if (!sameStack(sourceStack, record.item)) {
				this.#externalDeposits.delete(record.id);
				this.#persist();
				return true;
			}
			try {
				source.container.moveItem(source.slot, 0, escrow.container);
			} catch (error) {
				this.#report(new Error(`External depot deposit ${record.id} source move was rejected: ${error}`));
			}
			const afterSource = this.#readExternalStack(source.container, source.slot, callbacks.decodeStack);
			const afterEscrow = this.#readExternalStack(escrow.container, 0, callbacks.decodeStack);
			if (afterSource === undefined && sameStack(afterEscrow, record.item)) {
				record.state = "escrowed";
				this.#persist();
				return true;
			}
			return sameStack(afterSource, record.item) && afterEscrow === undefined
				? false
				: this.#blockExternalDeposit(record, "could not verify source ownership after the native move");
		}

		if (record.state === "escrowed") {
			if (!sameStack(escrowStack, record.item))
				return this.#blockExternalDeposit(record, "escrow no longer owns the expected item");
			if (depot.port.previewInsert(record.item).remainder)
				return false;
			const before = depot.port.snapshot();
			const inserted = depot.port.insert(record.item, { receiptId: `${record.id}:deposit` });
			if (inserted.remainder) {
				depot.port.restore(before);
				return this.#blockExternalDeposit(record, "destination changed during a full-stack deposit");
			}
			record.state = "depoted";
			this.#persist();
			return true;
		}

		if (record.state === "depoted") {
			if (escrowStack !== undefined && !sameStack(escrowStack, record.item))
				return this.#blockExternalDeposit(record, "escrow ownership conflicts with the committed depot item");
			if (escrowStack !== undefined) {
				escrow.container.setItem(0, undefined);
				if (this.#readExternalStack(escrow.container, 0, callbacks.decodeStack) !== undefined)
					return this.#blockExternalDeposit(record, "could not clear a committed external escrow");
			}
			this.#externalDeposits.delete(record.id);
			this.#persist();
			return true;
		}

		return false;
	}

	#tickExternalWithdrawal(record, callbacks) {
		const depot = this.#depots.get(record.depotId);
		if (!depot) {
			this.#report(new Error(`External depot withdrawal ${record.id} has no source depot`));
			return false;
		}
		const escrow = callbacks.resolveEscrow(record);
		if (!escrow)
			return false;
		assertExternalContainer(escrow, "External depot escrow");
		if (escrow.container.size !== 1)
			throw new Error("External depot escrows must have one slot");
		let escrowStack = this.#readExternalStack(escrow.container, 0, callbacks.decodeStack);

		if (record.state === "intent") {
			if (escrowStack !== undefined)
				return this.#blockExternalWithdrawal(record, "escrow is occupied before source extraction");
			let extracted;
			try {
				extracted = depot.port.extract(record.reservation, { receiptId: `${record.id}:withdraw` });
			} catch (error) {
				return this.#blockExternalWithdrawal(record, `source reservation could not be extracted: ${error}`);
			}
			if (!sameStack(extracted, record.item))
				return this.#blockExternalWithdrawal(record, "source extraction did not match the planned item");
			record.state = "escrowed";
			this.#persist();
			return true;
		}

		if (record.state === "escrowed") {
			let target = callbacks.resolveTarget(record.target);
			if (target) {
				assertExternalContainer(target, "External depot withdrawal target");
				if (!Number.isInteger(target.slot) || target.slot < 0 || target.slot >= target.container.size)
					throw new RangeError("External depot withdrawal target slot is outside its container");
				const targetStack = this.#readExternalStack(target.container, target.slot, callbacks.decodeStack);
				// A native move may have completed immediately before a process restart.
				// The planned target slot was empty at intent creation, so this is the
				// only recoverable owner when the physical escrow is now empty.
				if (escrowStack === undefined && sameStack(targetStack, record.item)) {
					record.state = "delivered";
					this.#persist();
					return true;
				}
			}
			if (escrowStack === undefined) {
				let physical;
				try {
					physical = callbacks.createStack(record.item);
					if (!sameStack(cloneItemStack(callbacks.decodeStack(physical)), record.item))
						throw new Error("stack factory changed the planned item");
					escrow.container.setItem(0, physical);
				} catch (error) {
					this.#report(new Error(`External depot withdrawal ${record.id} could not populate escrow: ${error}`));
					return false;
				}
				escrowStack = this.#readExternalStack(escrow.container, 0, callbacks.decodeStack);
				if (!sameStack(escrowStack, record.item))
					return this.#blockExternalWithdrawal(record, "could not verify escrow ownership after creation");
			}
			if (!sameStack(escrowStack, record.item))
				return this.#blockExternalWithdrawal(record, "escrow ownership conflicts with the planned item");
			target = callbacks.resolveTarget(record.target);
			if (!target)
				return false;
			assertExternalContainer(target, "External depot withdrawal target");
			if (!Number.isInteger(target.slot) || target.slot < 0 || target.slot >= target.container.size)
				throw new RangeError("External depot withdrawal target slot is outside its container");
			const targetStack = this.#readExternalStack(target.container, target.slot, callbacks.decodeStack);
			if (targetStack !== undefined)
				return sameStack(targetStack, record.item)
					? this.#blockExternalWithdrawal(record, "target and escrow both own the planned item")
					: false;
			try {
				escrow.container.moveItem(0, target.slot, target.container);
			} catch (error) {
				this.#report(new Error(`External depot withdrawal ${record.id} target move was rejected: ${error}`));
			}
			const afterEscrow = this.#readExternalStack(escrow.container, 0, callbacks.decodeStack);
			const afterTarget = this.#readExternalStack(target.container, target.slot, callbacks.decodeStack);
			if (afterEscrow === undefined && sameStack(afterTarget, record.item)) {
				record.state = "delivered";
				this.#persist();
				return true;
			}
			return sameStack(afterEscrow, record.item) && afterTarget === undefined
				? false
				: this.#blockExternalWithdrawal(record, "could not verify target ownership after the native move");
		}

		if (record.state === "delivered") {
			if (escrowStack !== undefined && !sameStack(escrowStack, record.item))
				return this.#blockExternalWithdrawal(record, "completed withdrawal escrow contains another item");
			if (escrowStack !== undefined) {
				escrow.container.setItem(0, undefined);
				if (this.#readExternalStack(escrow.container, 0, callbacks.decodeStack) !== undefined)
					return this.#blockExternalWithdrawal(record, "could not clear a completed withdrawal escrow");
			}
			this.#externalWithdrawals.delete(record.id);
			this.#persist();
			return true;
		}

		return false;
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

	#readExternalStack(container, slot, decodeStack) {
		const physical = container.getItem(slot);
		return physical === undefined ? undefined : cloneItemStack(decodeStack(physical));
	}

	#blockExternalDeposit(record, reason) {
		record.state = "blocked";
		this.#report(new Error(`External depot deposit ${record.id} is blocked: ${reason}`));
		this.#persist();
		return true;
	}

	#blockExternalWithdrawal(record, reason) {
		record.state = "blocked";
		this.#report(new Error(`External depot withdrawal ${record.id} is blocked: ${reason}`));
		this.#persist();
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
