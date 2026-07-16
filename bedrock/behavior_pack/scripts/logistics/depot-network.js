import { ShardedStateStore } from "../kernel/sharded-state-store.js";
import { CreativeItemPort } from "./creative-item-port.js";
import { ItemFilter } from "./item-filter.js";
import { cloneItemStack, itemStackFingerprint, ItemPort } from "./item-port.js";
import { ItemTransferJournal } from "./item-transfer-journal.js";
import { createLogisticsEndpoint, matchesLogisticsEndpoint, normalizeLogisticsAddress, normalizeLogisticsNetworkId, updateLogisticsEndpoint } from "./logistics-address.js";

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

function stableStringify(value) {
	if (value === null || typeof value !== "object")
		return JSON.stringify(value);
	if (Array.isArray(value))
		return `[${value.map(stableStringify).join(",")}]`;
	return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function rekeyPortSnapshot(snapshot, id) {
	const port = clone(snapshot);
	const sourceId = port.id;
	port.id = id;
	if (!Array.isArray(port.extractionReceipts))
		return port;
	port.extractionReceipts = port.extractionReceipts.map(([receiptId, receipt]) => {
		if (typeof receipt?.reservationFingerprint !== "string")
			return [receiptId, receipt];
		let reservation;
		try {
			reservation = JSON.parse(receipt.reservationFingerprint);
		} catch {
			throw new TypeError("Moving depot extraction receipts must be valid reservation snapshots");
		}
		if (reservation?.portId !== sourceId)
			return [receiptId, receipt];
		return [receiptId, { ...receipt, reservationFingerprint: stableStringify({ ...reservation, portId: id }) }];
	});
	return port;
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

function assertManagedPort(port) {
	if (!port || typeof port.id !== "string" || port.transactionStorage !== "managed"
		|| typeof port.extract !== "function" || typeof port.insert !== "function" || typeof port.reserve !== "function"
		|| typeof port.snapshot !== "function" || typeof port.restore !== "function")
		throw new TypeError("External logistics endpoints require managed ItemPort-compatible storage");
	return port;
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
	#externalManagedDepotIds = new Set();
	#externalDeposits = new Map();
	#externalWithdrawals = new Map();
	#funnels = new Map();
	#journal = new ItemTransferJournal();
	#onError;
	#requestOrders = new Map();
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
			if (record.kind === "external_managed_depot")
				return sectionKey(record.dimensionId, record.location);
				if (record.kind === "transfer")
					return record.partition;
				if (record.kind === "request_order")
					return `request_order:${record.id}`;
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
		const source = this.#requireDepot(sourceId);
		const destination = this.#requireDepot(destinationId);
		if (source.externalManaged && source.role !== "output")
			throw new Error("External managed belt sources must expose an output port");
		if (destination.externalManaged && destination.role !== "input")
			throw new Error("External managed belt destinations must expose an input port");
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

	createChute({ destinationId, filter, id, sourceId }) {
		if (typeof id !== "string" || id.length === 0)
			throw new TypeError("Chutes require an identifier");
		if (this.#chutes.has(id))
			return id;
		this.#requireDepot(sourceId);
		this.#requireDepot(destinationId);
		this.#chutes.set(id, {
			destinationId,
			filter: filter instanceof ItemFilter ? filter : new ItemFilter(filter),
			id,
			nextTransfer: 0,
			sourceId
		});
		this.#persist();
		return id;
	}

	canRemoveDepot(id) {
		const depot = this.#depots.get(id);
		if (!depot)
			return true;
		if (this.#hasDepotRelocationDependency(id))
			return false;
		// A restored external endpoint is deliberately unattached until its owning
		// machine restores. Do not dereference that port during early startup.
		if (!depot.port)
			return false;
		const inspection = depot.port.inspect();
		return Array.isArray(inspection.slots)
			? inspection.slots.every(stack => stack === undefined)
			: inspection.template === undefined;
	}

	/**
	 * Capture a port for a dynamic assembly without removing it.  Inventory is
	 * intentionally included: unlike a player break, a contraption carries the
	 * port as one authoritative object.  Connections and in-flight work remain
	 * at fixed world coordinates, so those are an explicit safe-refusal.
	 */
	snapshotDepotForAssembly(id) {
		const depot = this.#requireDepot(id);
		if (this.#hasDepotRelocationDependency(id))
			throw new Error(`Depot ${id} has an active transfer or logistics connection`);
		return {
			logistics: clone(depot.logistics),
			port: clone(depot.port.snapshot()),
			portKind: depot.kind,
			schemaVersion: 1
		};
	}

	/** Remove the source identity only after its portable record was validated. */
	takeDepotForAssembly(id) {
		const record = this.snapshotDepotForAssembly(id);
		this.#depots.delete(id);
		this.#persist();
		return record;
	}

	/**
	 * Re-key a detached port to its materialized world location.  Port receipt
	 * history is retained, but its location-derived ID is rewritten so stale
	 * source coordinates cannot own the inventory after disassembly.
	 */
	restoreDepotFromAssembly({ dimensionId, location, record }) {
		if (!record || record.schemaVersion !== 1 || !["depot", "creative"].includes(record.portKind) || !record.port)
			throw new TypeError("Dynamic assembly depot records require a versioned port snapshot");
		const normalizedLocation = assertLocation(location);
		const id = depotId(dimensionId, normalizedLocation);
		const port = rekeyPortSnapshot(record.port, id);
		const restored = this.#depotFromRecord({
			dimensionId,
			kind: "depot",
			logistics: clone(record.logistics),
			location: normalizedLocation,
			port,
			portKind: record.portKind
		});
		const existing = this.#depots.get(id);
		if (existing && existing.kind !== restored.kind)
			throw new Error(`Depot ${id} conflicts with a different port kind`);
		this.#depots.set(id, restored);
		this.#persist();
		return id;
	}

	canRemoveBelt(id) {
		return ![...this.#transports.values()].some(transport => transport.beltId === id);
	}

	canRemoveChute(id) {
		return !this.#journal.snapshot().some(record => record.id.startsWith(`chute:${id}:`));
	}

	canRemoveFunnel(id) {
		return !this.#journal.snapshot().some(record => record.id.startsWith(`funnel:${id}:`));
	}

	createDepot({ dimensionId, kind = "depot", location, logistics, maxStackSize = 64, size = 1 }) {
		if (kind !== "depot" && kind !== "creative")
			throw new TypeError("Logistics ports must be standard depots or creative crates");
		const id = depotId(dimensionId, location);
		const existing = this.#depots.get(id);
		if (existing)
			return id;
		const depot = {
			dimensionId,
			kind,
			logistics: createLogisticsEndpoint(logistics),
			location: assertLocation(location),
			port: kind === "creative" ? new CreativeItemPort({ id }) : new ItemPort({ id, maxStackSize, size })
		};
		this.#depots.set(id, depot);
		this.#persist();
		return id;
	}

	/**
	 * Register a live managed port owned by another durable subsystem. Its
	 * inventory remains in that subsystem's snapshot; this network persists only
	 * the stable endpoint identity so belts recover before the owner reattaches.
	 */
	registerExternalManagedDepot({ dimensionId, id, location, logistics, onPortMutation, port, role }) {
		if (typeof id !== "string" || id.length === 0)
			throw new TypeError("External logistics endpoints require stable identifiers");
		if (!["input", "output"].includes(role))
			throw new TypeError("External logistics endpoint roles must be input or output");
		if (onPortMutation !== undefined && typeof onPortMutation !== "function")
			throw new TypeError("External logistics endpoint mutation hooks must be functions");
		const normalizedPort = assertManagedPort(port);
		const normalizedLocation = assertLocation(location);
		const existing = this.#depots.get(id);
		if (existing) {
			if (!existing.externalManaged || existing.dimensionId !== dimensionId || existing.role !== role
				|| existing.location.x !== normalizedLocation.x || existing.location.y !== normalizedLocation.y || existing.location.z !== normalizedLocation.z)
				throw new Error(`External logistics endpoint ${id} conflicts with an existing depot`);
			existing.port = normalizedPort;
			existing.onPortMutation = onPortMutation;
			return id;
		}
		this.#depots.set(id, {
			dimensionId,
			externalManaged: true,
			kind: "external",
			logistics: createLogisticsEndpoint(logistics),
			location: normalizedLocation,
			onPortMutation,
			port: normalizedPort,
			role
		});
		this.#externalManagedDepotIds.add(id);
		this.#persist();
		return id;
	}

	/** A moved owner can release its live port while retaining route recovery metadata. */
	releaseExternalManagedDepot(id) {
		const depot = this.#depots.get(id);
		if (!depot?.externalManaged)
			return false;
		depot.port = undefined;
		return true;
	}

	removeExternalManagedDepot(id) {
		const depot = this.#depots.get(id);
		if (!depot?.externalManaged)
			return false;
		if (this.#hasDepotRelocationDependency(id))
			throw new Error(`External logistics endpoint ${id} still has a fixed connection or active transfer`);
		this.#depots.delete(id);
		this.#externalManagedDepotIds.delete(id);
		this.#persist();
		return true;
	}

	configureLogisticsEndpoint(id, { expectedRevision, patch }) {
		const depot = this.#requireDepot(id);
		const result = updateLogisticsEndpoint(depot.logistics, { expectedRevision, patch });
		if (!result.changed)
			return result;
		depot.logistics = createLogisticsEndpoint(result.endpoint);
		this.#persist();
		return { ...result, endpoint: { ...depot.logistics } };
	}

	logisticsEndpoint(id) {
		return { ...this.#requireDepot(id).logistics };
	}

	setCreativeTemplate(id, template) {
		const depot = this.#requireDepot(id);
		if (depot.kind !== "creative" || typeof depot.port.setTemplate !== "function")
			return false;
		const changed = depot.port.setTemplate(template);
		if (changed)
			this.#persist();
		return changed;
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
			requestOrders: this.#requestOrders.size,
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

	hasDepot(id) {
		return this.#depots.has(id);
	}

	stockCount(id, itemType) {
		if (typeof itemType !== "string" || itemType.length === 0)
			throw new TypeError("Depot stock counts require a non-empty item identifier");
		const inspection = this.#requireDepot(id).port.inspect();
		const stacks = Array.isArray(inspection.slots) ? inspection.slots : [inspection.template];
		return stacks.filter(stack => stack?.typeId === itemType).reduce((count, stack) => count + stack.count, 0);
	}

	/**
	 * Summarize one addressed network without treating pending reservations as
	 * freely requestable inventory. `inFlight` is escrowed stock already removed
	 * from a source but not yet delivered.
	 */
	networkStockSummary({ dimensionId, itemType, networkId, targetAddress = "" }) {
		if (typeof dimensionId !== "string" || dimensionId.length === 0 || typeof itemType !== "string" || itemType.length === 0)
			throw new TypeError("Network stock summaries require a dimension and non-empty item identifier");
		const routing = { networkId: normalizeLogisticsNetworkId(networkId), targetAddress: normalizeLogisticsAddress(targetAddress) };
		// Managed machine ports are belt-only in this phase. Their ItemPort IDs
		// belong to the machine, rather than the depot-address namespace used by
		// Redstone requester journals.
		const endpoints = [...this.#depots.values()]
			.filter(depot => !depot.externalManaged && depot.port && depot.dimensionId === dimensionId && matchesLogisticsEndpoint(depot.logistics, routing));
		const endpointIds = new Set(endpoints.map(depot => depot.port.id));
		let physical = endpoints.reduce((count, depot) => count + this.stockCount(depot.port.id, itemType), 0);
		let reserved = 0;
		let inFlight = 0;
		for (const transfer of this.#journal.snapshot()) {
			if (!endpointIds.has(transfer.sourceId))
				continue;
			const stack = transfer.state === "intent" ? transfer.reservation?.item : transfer.item;
			if (stack?.typeId !== itemType)
				continue;
			if (transfer.state === "intent")
				reserved += stack.count;
			else
				inFlight += stack.count;
		}
		return {
			available: Math.max(0, physical - reserved),
			endpointCount: endpoints.length,
			inFlight,
			physical,
			reserved
		};
	}

	/**
	 * Reserve matching stock through the ordinary crash-safe transfer journal.
	 *
	 * A Redstone Requester must be able to fulfil a single order from more than
	 * one depot.  Each selected depot receives its own durable journal record;
	 * this keeps extraction/restart recovery exactly the same as a normal depot
	 * transfer while allowing one request to fan out safely.
	 */
	requestItem({ allowPartial = false, destinationId, id, itemType, maxCount, networkId = "default", targetAddress = "" }) {
		if (typeof allowPartial !== "boolean" || typeof itemType !== "string" || itemType.length === 0
			|| !Number.isInteger(maxCount) || maxCount < 1)
			throw new TypeError("Depot item requests require a filter, positive amount, and partial-request flag");
		const existing = this.#requestOrders.get(id);
		if (existing)
			return {
				duplicate: true,
				ok: existing.state !== "failed",
				order: clone(existing),
				...(existing.state === "failed" ? { reason: "request_failed" } : {})
			};
		const destination = this.#requireDepot(destinationId);
		if (this.#isDepotWithdrawalLocked(destinationId))
			return { ok: false, reason: "destination_withdrawal_active" };
		const routing = { networkId: normalizeLogisticsNetworkId(networkId), targetAddress: normalizeLogisticsAddress(targetAddress) };
		const candidates = [...this.#depots.values()]
			.filter(depot => !depot.externalManaged && depot.port && depot.dimensionId === destination.dimensionId
				&& depot.port.id !== destinationId
				&& matchesLogisticsEndpoint(depot.logistics, routing)
				&& !this.#isDepotWithdrawalLocked(depot.port.id)
				&& !this.#journal.hasSource(depot.port.id))
			.map(depot => ({
				available: this.#availableStockAt(depot.port.id, itemType),
				id: depot.port.id
			}))
			.filter(candidate => candidate.available > 0)
			.sort((left, right) => right.available - left.available || left.id.localeCompare(right.id));
		const available = candidates.reduce((total, candidate) => total + candidate.available, 0);
		if (available === 0)
			return { ok: false, reason: targetAddress === "" ? "item_unavailable" : "address_unavailable" };
		if (!allowPartial && available < maxCount)
			return { ok: false, reason: "insufficient_total_stock" };

		const requested = allowPartial ? Math.min(maxCount, available) : maxCount;
		const transfers = [];
		let remaining = requested;
		for (const candidate of candidates) {
			if (remaining === 0)
				break;
			const result = this.#journal.begin({
				destination: destination.port,
				id: `${id}:source:${transfers.length}`,
				maxCount: remaining,
				predicate: stack => stack.typeId === itemType,
				source: this.#requireDepot(candidate.id).port
			});
			if (!result.ok)
				continue;
			transfers.push(result.record);
			remaining -= result.record.reservation.item.count;
		}

		if (!allowPartial && remaining > 0) {
			// No extraction has happened before the following tick, so rolling back
			// these intents is deterministic and leaves no partially accepted order.
			for (const transfer of transfers)
				this.#journal.rollback(transfer.id, sourceId => this.#depots.get(sourceId)?.port);
			return { ok: false, reason: "insufficient_reservable_stock" };
		}
		if (transfers.length === 0)
			return { ok: false, reason: "item_unavailable" };

		const order = {
			completedTransferIds: [],
			destinationId,
			id,
			requested,
			reserved: requested - remaining,
			state: "pending",
			transferIds: transfers.map(transfer => transfer.id)
		};
		this.#requestOrders.set(id, order);
		this.#persist();
		return {
			ok: true,
			order: clone(order),
			routing,
			requested,
			reserved: requested - remaining,
			transfers: transfers.map(transfer => clone(transfer))
		};
	}

	requestStatus(id) {
		if (typeof id !== "string" || id.length === 0)
			throw new TypeError("Request status lookups require an identifier");
		const order = this.#requestOrders.get(id);
		return order ? clone(order) : undefined;
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
		if (!this.canRemoveBelt(id))
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
		const requestOrders = [];
		const transfers = [];
		const transports = [];
		for (const record of restored.records) {
			try {
				if (record?.kind === "transfer") {
					transfers.push(this.#transferFromRecord(record));
					continue;
				}
				if (record?.kind === "request_order") {
					requestOrders.push(record);
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
				const depot = record?.kind === "external_managed_depot"
					? this.#externalManagedDepotFromRecord(record)
					: this.#depotFromRecord(record);
				if (depots.has(depot.id))
					throw new Error(`duplicate depot ${depot.id}`);
				depots.set(depot.id, depot);
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
		const restoredRequestOrders = new Map();
		for (const record of requestOrders) {
			try {
				const order = this.#requestOrderFromRecord(record, depots);
				if (restoredRequestOrders.has(order.id))
					throw new Error(`duplicate request order ${order.id}`);
				restoredRequestOrders.set(order.id, order);
			} catch (error) {
				this.#report(new Error(`Ignored invalid request order: ${error}`));
			}
		}
		this.#journal.restore(transfers);
		this.#belts = restoredBelts;
		this.#chutes = restoredChutes;
		this.#depots = depots;
		this.#externalManagedDepotIds = new Set([...depots.entries()]
			.filter(([, depot]) => depot.externalManaged)
			.map(([id]) => id));
		this.#externalDeposits = restoredExternalDeposits;
		this.#externalWithdrawals = restoredExternalWithdrawals;
		this.#funnels = restoredFunnels;
		this.#requestOrders = restoredRequestOrders;
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

	setFunnelFilter(id, filter) {
		const funnel = this.#funnels.get(id);
		if (!funnel)
			throw new Error(`Unknown funnel ${id}`);
		funnel.filter = filter instanceof ItemFilter ? filter : new ItemFilter(filter);
		this.#persist();
		return true;
	}

	setChuteFilter(id, filter) {
		const chute = this.#chutes.get(id);
		if (!chute)
			throw new Error(`Unknown chute ${id}`);
		chute.filter = filter instanceof ItemFilter ? filter : new ItemFilter(filter);
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
		if (record.port.id !== id)
			throw new TypeError("Depot port identity does not match its location");
		const kind = record.portKind === "creative" || record.port.kind === "creative" ? "creative" : "depot";
		if (kind === "depot" && !Array.isArray(record.port.slots))
			throw new TypeError("Standard depot records require slot state");
		const port = kind === "creative"
			? new CreativeItemPort({ id })
			: new ItemPort({
				id,
				maxStackSize: record.port.maxStackSize,
				size: record.port.slots.length
			});
		port.restore(record.port);
		return {
			dimensionId: record.dimensionId,
			id,
			kind,
			logistics: createLogisticsEndpoint(record.logistics),
			location,
			port
		};
	}

	#externalManagedDepotFromRecord(record) {
		if (record?.kind !== "external_managed_depot" || typeof record.id !== "string" || record.id.length === 0
			|| typeof record.dimensionId !== "string" || !["input", "output"].includes(record.role))
			throw new TypeError("External managed depot records require an identity, location, and role");
		return {
			dimensionId: record.dimensionId,
			externalManaged: true,
			id: record.id,
			kind: "external",
			logistics: createLogisticsEndpoint(record.logistics),
			location: assertLocation(record.location),
			port: undefined,
			role: record.role
		};
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
			filter: new ItemFilter(record.filter),
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

	#requestOrderFromRecord(record, depots) {
		if (record?.kind !== "request_order" || typeof record.id !== "string" || record.id.length === 0
			|| typeof record.destinationId !== "string" || !depots.has(record.destinationId)
			|| !Number.isInteger(record.requested) || record.requested < 1
			|| !Number.isInteger(record.reserved) || record.reserved < 1 || record.reserved > record.requested
			|| !["pending", "fulfilled", "partial", "failed"].includes(record.state)
			|| !Array.isArray(record.transferIds) || record.transferIds.length < 1
			|| record.transferIds.some(id => typeof id !== "string" || id.length === 0)
			|| !Array.isArray(record.completedTransferIds ?? [])
			|| (record.completedTransferIds ?? []).some(id => typeof id !== "string" || !record.transferIds.includes(id)))
			throw new TypeError("Request orders require a destination, positive amounts, state, and transfer IDs");
		return {
			completedTransferIds: [...new Set(record.completedTransferIds ?? [])].sort(),
			destinationId: record.destinationId,
			id: record.id,
			requested: record.requested,
			reserved: record.reserved,
			state: record.state,
			transferIds: [...new Set(record.transferIds)].sort()
		};
	}

	#launchBeltTransport(occupiedEndpoints = new Set()) {
		for (const belt of [...this.#belts.values()].sort((left, right) => left.id.localeCompare(right.id))) {
			if (belt.speed === 0 || [...this.#transports.values()].some(transport => transport.beltId === belt.id))
				continue;
			if (this.#isDepotWithdrawalLocked(belt.sourceId) || this.#isDepotWithdrawalLocked(belt.destinationId))
				continue;
			const sourceId = belt.speed > 0 ? belt.sourceId : belt.destinationId;
			const destinationId = belt.speed > 0 ? belt.destinationId : belt.sourceId;
			if (occupiedEndpoints.has(sourceId) || occupiedEndpoints.has(destinationId))
				continue;
			const source = this.#depots.get(sourceId)?.port;
			const destination = this.#depots.get(destinationId)?.port;
			if (!source || !destination)
				continue;
			const reservation = source.reserve();
			if (!reservation)
				continue;
			const sequence = belt.nextTransport++;
			const id = `${belt.id}:${sequence}`;
			const item = source.extract(reservation, { receiptId: `belt:${belt.id}:extract:${sequence}` });
			this.#notifyExternalPortMutation(sourceId);
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

	#notifyExternalPortMutation(id) {
		const callback = this.#depots.get(id)?.onPortMutation;
		if (!callback)
			return;
		try {
			callback();
		} catch (error) {
			this.#report(new Error(`External logistics endpoint ${id} could not checkpoint its owner: ${error}`));
		}
	}

	#records() {
		const depots = [...this.#depots.values()]
			.filter(depot => !depot.externalManaged)
			.map(depot => ({
				dimensionId: depot.dimensionId,
				kind: "depot",
				logistics: { ...depot.logistics },
				location: { ...depot.location },
				portKind: depot.kind,
				port: depot.port.snapshot()
			}))
			.sort((left, right) => left.port.id.localeCompare(right.port.id));
		const externalManagedDepots = [...this.#depots.entries()]
			.filter(([, depot]) => depot.externalManaged)
			.map(([id, depot]) => ({
				dimensionId: depot.dimensionId,
				id,
				kind: "external_managed_depot",
				logistics: { ...depot.logistics },
				location: { ...depot.location },
				role: depot.role
			}))
			.sort((left, right) => left.id.localeCompare(right.id));
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
			.map(chute => ({
				destinationId: chute.destinationId,
				filter: chute.filter.snapshot(),
				id: chute.id,
				kind: "chute",
				nextTransfer: chute.nextTransfer,
				sourceId: chute.sourceId
			}))
			.sort((left, right) => left.id.localeCompare(right.id));
		const externalDeposits = [...this.#externalDeposits.values()]
			.map(deposit => ({ ...deposit, item: cloneItemStack(deposit.item), kind: "external_deposit", source: clone(deposit.source) }))
			.sort((left, right) => left.id.localeCompare(right.id));
		const externalWithdrawals = [...this.#externalWithdrawals.values()]
			.map(withdrawal => ({ ...withdrawal, item: cloneItemStack(withdrawal.item), kind: "external_withdrawal", reservation: clone(withdrawal.reservation), target: clone(withdrawal.target) }))
			.sort((left, right) => left.id.localeCompare(right.id));
		const transfers = this.#journal.snapshot().map(record => ({ ...record, kind: "transfer" }));
		const requestOrders = [...this.#requestOrders.values()]
			.map(order => ({ ...order, completedTransferIds: [...order.completedTransferIds], kind: "request_order", transferIds: [...order.transferIds] }))
			.sort((left, right) => left.id.localeCompare(right.id));
		const transports = [...this.#transports.values()]
			.map(transport => ({ ...transport, item: cloneItemStack(transport.item), kind: "transport" }))
			.sort((left, right) => left.id.localeCompare(right.id));
		return [...depots, ...externalManagedDepots, ...belts, ...funnels, ...chutes, ...externalDeposits, ...externalWithdrawals, ...requestOrders, ...transfers, ...transports];
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

	#availableStockAt(id, itemType) {
		let available = this.stockCount(id, itemType);
		for (const transfer of this.#journal.snapshot())
			if (transfer.sourceId === id && transfer.state === "intent" && transfer.reservation?.item?.typeId === itemType)
				available -= transfer.reservation.item.count;
		return Math.max(0, available);
	}

	#isDepotBusy(id) {
		return this.#isDepotWithdrawalLocked(id)
			|| this.#journal.snapshot().some(record => record.sourceId === id || record.destinationId === id)
			|| [...this.#transports.values()].some(transport => transport.sourceId === id || transport.destinationId === id)
			|| [...this.#externalDeposits.values()].some(deposit => deposit.depotId === id);
	}

	#hasDepotRelocationDependency(id) {
		return this.#journal.snapshot().some(record => record.sourceId === id || record.destinationId === id)
			|| [...this.#belts.values()].some(belt => belt.sourceId === id || belt.destinationId === id)
			|| [...this.#funnels.values()].some(funnel => funnel.sourceId === id || funnel.destinationId === id)
			|| [...this.#chutes.values()].some(chute => chute.sourceId === id || chute.destinationId === id)
			|| [...this.#transports.values()].some(transport => transport.sourceId === id || transport.destinationId === id)
			|| [...this.#externalDeposits.values()].some(deposit => deposit.depotId === id)
			|| [...this.#externalWithdrawals.values()].some(withdrawal => withdrawal.depotId === id)
			|| [...this.#requestOrders.values()].some(order => order.state === "pending" && order.destinationId === id);
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
		const activeTransports = [...this.#transports.values()].sort((left, right) => left.id.localeCompare(right.id));
		const occupiedEndpoints = new Set();
		let changed = false;
		for (const transport of activeTransports) {
			// Independent routes may advance in the same scheduler pass.  A shared
			// endpoint remains exclusive until its in-flight transport reaches a
			// durable terminal state, preventing competing source reservations or
			// destination receipt races.
			occupiedEndpoints.add(transport.sourceId);
			occupiedEndpoints.add(transport.destinationId);
			changed = this.#tickBeltTransport(transport) || changed;
		}
		return this.#launchBeltTransport(occupiedEndpoints) || changed;
	}

	#tickBeltTransport(transport) {
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
		if (!destination)
			return false;
		if (this.#isDepotWithdrawalLocked(endpointId))
			return false;
		const operation = transport.progress === 1 ? "deliver" : "return";
		const result = destination.insert(transport.item, { receiptId: `belt:${transport.id}:${operation}:${transport.attempt}` });
		if (result.accepted)
			this.#notifyExternalPortMutation(endpointId);
		if (result.remainder) {
			transport.attempt++;
			transport.item = result.remainder;
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
			const source = this.#depots.get(funnel.sourceId)?.port;
			const destination = this.#depots.get(funnel.destinationId)?.port;
			if (!source || !destination)
				continue;
			const result = this.#journal.begin({
				destination,
				id: `funnel:${funnel.id}:${funnel.nextTransfer}`,
				predicate: stack => funnel.filter.accepts(stack),
				source
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
			const source = this.#depots.get(chute.sourceId)?.port;
			const destination = this.#depots.get(chute.destinationId)?.port;
			if (!source || !destination)
				continue;
			const result = this.#journal.begin({
				destination,
				id: `chute:${chute.id}:${chute.nextTransfer}`,
				predicate: stack => chute.filter.accepts(stack),
				source
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
		this.#updateRequestOrder(record.id, result);
		if (result.ok || result.reason === "destination_full" || result.reason === "source_changed" || result.reason === "source_missing")
			this.#persist();
		if (!result.ok)
			this.#cooldownTicks = this.#retryIntervalTicks;
		return true;
	}

	#updateRequestOrder(transferId, result) {
		const order = [...this.#requestOrders.values()].find(candidate => candidate.state === "pending" && candidate.transferIds.includes(transferId));
		if (!order)
			return false;
		if (result.state === "committed" && result.ok) {
			if (!order.completedTransferIds.includes(transferId))
				order.completedTransferIds.push(transferId);
			const remaining = order.transferIds.filter(id => !order.completedTransferIds.includes(id));
			if (remaining.length === 0)
				order.state = order.reserved === order.requested ? "fulfilled" : "partial";
			return true;
		}
		if (["source_changed", "source_missing"].includes(result.reason)) {
			order.state = "failed";
			return true;
		}
		return false;
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
