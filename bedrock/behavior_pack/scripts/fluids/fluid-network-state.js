import { ShardedStateStore } from "../kernel/sharded-state-store.js";
import { FluidNetwork } from "./fluid-network.js";
import { FluidTank } from "./fluid-tank.js";

function assertLocation(location) {
	if (!location || !Number.isInteger(location.x) || !Number.isInteger(location.y) || !Number.isInteger(location.z))
		throw new TypeError("Fluid tank locations require integer x, y, and z coordinates");
	return { x: location.x, y: location.y, z: location.z };
}

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function cloneExternalDescriptor(descriptor) {
	if (!descriptor || typeof descriptor !== "object" || Array.isArray(descriptor) || typeof descriptor.kind !== "string" || descriptor.kind.length === 0)
		throw new TypeError("External fluid ports require a typed descriptor");
	return clone(descriptor);
}

function assertPartition(partition) {
	if (typeof partition !== "string" || partition.length === 0)
		throw new TypeError("Fluid ports require a persistent partition");
	return partition;
}

function sectionKey(dimensionId, location) {
	return `${dimensionId}:${Math.floor(location.x / 16)}:${Math.floor(location.y / 16)}:${Math.floor(location.z / 16)}`;
}

export function fluidTankId(dimensionId, location) {
	if (typeof dimensionId !== "string" || dimensionId.length === 0)
		throw new TypeError("Fluid tanks require a dimension identifier");
	const normalized = assertLocation(location);
	return `fluid-tank:${dimensionId}:${normalized.x}:${normalized.y}:${normalized.z}`;
}

export class FluidNetworkState {
	#externalPortFactory;
	#externalPorts = new Map();
	#frozen = false;
	#network;
	#onError;
	#retirements = new Map();
	#store;
	#tanks = new Map();
	#transfersPerTick;

	constructor({ externalPortFactory, keyPrefix = "createbedrock:fluid_state_v1", onError, storage, transfersPerTick, writesPerTick }) {
		if (externalPortFactory !== undefined && typeof externalPortFactory !== "function")
			throw new TypeError("Fluid external-port factories must be functions");
		if (onError !== undefined && typeof onError !== "function")
			throw new TypeError("Fluid network error handlers must be functions");
		this.#onError = onError ?? (() => {});
		this.#externalPortFactory = externalPortFactory;
		this.#transfersPerTick = transfersPerTick;
		this.#network = this.#newNetwork();
		this.#store = new ShardedStateStore({
			keyPrefix,
			onCommit: () => this.#retireCommittedExternalEscrows(),
			onError: error => this.#report(error),
			partitionFor(record) {
				if (typeof record?.partition !== "string" || record.partition.length === 0)
					throw new TypeError("Fluid state records require a persistent partition");
				return record.partition;
			},
			storage,
			writesPerTick
		});
	}

	hasLink(id) {
		return this.#network.snapshot().links.some(link => link.id === id);
	}

	hasTank(id) {
		return this.#tanks.has(id);
	}

	inspectTank(id) {
		return this.#requireTank(id).tank.inspect();
	}

	/**
	 * Exposes the transactional port, not a mutable fluid stack. Machine
	 * runtimes use this for receipt-based ledgers while the network remains the
	 * sole persistence owner.
	 */
	tankPort(id) {
		this.#assertActive();
		return this.#requireTank(id).tank;
	}

	tankEntries() {
		return [...this.#tanks.values()].map(entry => ({
			dimensionId: entry.dimensionId,
			inspection: entry.tank.inspect(),
			location: { ...entry.location }
		}));
	}

	links() {
		return this.#network.snapshot().links;
	}

	canRemoveTank(id) {
		const tank = this.#tanks.get(id);
		if (!tank)
			return true;
		if (!this.canRemovePort(id))
			return false;
		return tank.tank.inspect().contents === undefined;
	}

	canRemovePort(id) {
		const state = this.#network.snapshot();
		return !state.links.some(link => link.sourceId === id || link.destinationId === id)
			&& !state.transfers.some(transfer => transfer.sourceId === id || transfer.destinationId === id);
	}

	createPipe(options) {
		this.#assertActive();
		const id = this.#network.createPipe(options);
		this.#persist();
		return id;
	}

	createPump(options) {
		this.#assertActive();
		const id = this.#network.createPump(options);
		this.#persist();
		return id;
	}

	createTank({ capacity = 8_000, dimensionId, location }) {
		this.#assertActive();
		const normalized = assertLocation(location);
		const id = fluidTankId(dimensionId, normalized);
		if (this.#tanks.has(id))
			return id;
		const tank = new FluidTank({ capacity, id });
		this.#tanks.set(id, { dimensionId, location: normalized, tank });
		this.#network.registerPort(tank);
		this.#persist();
		return id;
	}

	diagnostics() {
		return {
			externalPorts: this.#externalPorts.size,
			frozen: this.#frozen,
			retiringExternalEscrows: this.#retirements.size,
			tanks: this.#tanks.size,
			waitingForCommit: this.#persistencePending(),
			...this.#network.diagnostics(),
			...this.#store.diagnostics()
		};
	}

	activeExternalEscrowIds() {
		return new Set([
			...this.#network.snapshot().transfers.flatMap(transfer => [transfer.reservation?.escrowId, transfer.delivery?.escrowId]).filter(Boolean),
			...[...this.#retirements.values()].map(retirement => retirement.reservation.escrowId)
		]);
	}

	extract(id, { maxAmount, predicate, receiptId } = {}) {
		this.#assertActive();
		const tank = this.#requireTank(id).tank;
		const reservation = tank.reserve({ maxAmount, predicate });
		if (!reservation)
			return undefined;
		const fluid = tank.extract(reservation, { receiptId });
		this.#network.markPortDirty(id);
		this.#persist();
		return fluid;
	}

	insert(id, fluid, options) {
		this.#assertActive();
		const result = this.#requireTank(id).tank.insert(fluid, options);
		if (result.accepted) {
			this.#network.markPortDirty(id);
			this.#persist();
		}
		return result;
	}

	registerExternalPort({ descriptor, partition, port }) {
		this.#assertActive();
		const normalizedDescriptor = cloneExternalDescriptor(descriptor);
		const normalizedPartition = assertPartition(partition);
		if (!port || typeof port.id !== "string" || port.id.length === 0)
			throw new TypeError("External fluid ports require stable identifiers");
		if (this.#tanks.has(port.id))
			throw new Error(`External fluid port ${port.id} conflicts with a fluid tank`);
		const existing = this.#externalPorts.get(port.id);
		if (existing) {
			if (existing.partition !== normalizedPartition || JSON.stringify(existing.descriptor) !== JSON.stringify(normalizedDescriptor))
				throw new Error(`External fluid port ${port.id} was registered with conflicting metadata`);
			return port.id;
		}
		this.#network.registerPort(port);
		this.#externalPorts.set(port.id, {
			descriptor: normalizedDescriptor,
			partition: normalizedPartition,
			port
		});
		this.#persist();
		return port.id;
	}

	updateExternalPortDescriptor(id, descriptor) {
		this.#assertActive();
		const entry = this.#externalPorts.get(id);
		if (!entry)
			throw new Error(`Unknown external fluid port ${id}`);
		const normalizedDescriptor = cloneExternalDescriptor(descriptor);
		if (JSON.stringify(entry.descriptor) === JSON.stringify(normalizedDescriptor))
			return false;
		entry.descriptor = normalizedDescriptor;
		this.#network.markPortDirty(id);
		this.#persist();
		return true;
	}

	pruneExternalPorts() {
		this.#assertActive();
		const network = this.#network.snapshot();
		const referenced = new Set([
			...network.links.flatMap(link => [link.sourceId, link.destinationId]),
			...network.transfers.flatMap(transfer => [transfer.sourceId, transfer.destinationId]),
			...[...this.#retirements.values()].map(retirement => retirement.portId)
		]);
		let removed = 0;
		for (const id of [...this.#externalPorts.keys()]) {
			if (referenced.has(id))
				continue;
			this.#network.removePort(id);
			this.#externalPorts.delete(id);
			removed++;
		}
		if (removed > 0)
			this.#persist();
		return removed;
	}

	removeLink(id) {
		this.#assertActive();
		const removed = this.#network.removeLink(id);
		if (removed)
			this.#persist();
		return removed;
	}

	removeTank(id) {
		this.#assertActive();
		if (!this.canRemoveTank(id))
			throw new Error(`Fluid tank ${id} is not empty or has an active connection`);
		if (!this.#tanks.delete(id))
			return false;
		this.#network.removePort(id);
		this.#persist();
		return true;
	}

	unregisterExternalPort(id) {
		this.#assertActive();
		const entry = this.#externalPorts.get(id);
		if (!entry)
			return false;
		this.#network.removePort(id);
		this.#externalPorts.delete(id);
		this.#persist();
		return true;
	}

	restore() {
		let restored;
		try {
			restored = this.#store.read();
		} catch (error) {
			this.#freeze(`Fluid state could not be read: ${error}`);
			return { frozen: true, links: 0, tanks: 0, transfers: 0, warnings: [{ error: String(error), partition: "fluid:network" }] };
		}
		if (!restored)
			return { frozen: false, links: 0, tanks: 0, transfers: 0, warnings: [] };
		if (restored.warnings.length > 0) {
			this.#freeze(`Fluid state contains ${restored.warnings.length} corrupt shard warnings`);
			return { frozen: true, links: 0, tanks: 0, transfers: 0, warnings: restored.warnings };
		}

		try {
			const tanks = new Map();
			const externalPortRecords = [];
			const linkRecords = [];
			const retirements = new Map();
			const transfers = [];
			let roundRobinAfter;
			for (const record of restored.records) {
				if (record?.kind === "tank") {
					const entry = this.#tankFromRecord(record);
					if (tanks.has(entry.tank.id))
						throw new Error(`Fluid state contains duplicate tank ${entry.tank.id}`);
					tanks.set(entry.tank.id, entry);
					continue;
				}
				if (record?.kind === "link") {
					linkRecords.push({ link: clone(record.link), partition: record.partition });
					continue;
				}
				if (record?.kind === "external_port") {
					externalPortRecords.push(clone(record));
					continue;
				}
				if (record?.kind === "transfer") {
					if (record.partition !== record.transfer?.partition)
						throw new Error("Fluid transfer partition does not match its record");
					transfers.push(clone(record.transfer));
					continue;
				}
				if (record?.kind === "network") {
					if (roundRobinAfter !== undefined)
						throw new Error("Fluid state contains duplicate network metadata");
					if (record.partition !== "fluid:network" || (record.roundRobinAfter !== undefined && typeof record.roundRobinAfter !== "string"))
						throw new Error("Fluid network metadata is invalid");
					roundRobinAfter = record.roundRobinAfter;
					continue;
				}
				if (record?.kind === "external_escrow_retirement") {
					const retirement = this.#retirementFromRecord(record);
					if (retirements.has(retirement.retirementId))
						throw new Error(`Fluid state contains duplicate external escrow retirement ${retirement.retirementId}`);
					retirements.set(retirement.retirementId, retirement);
					continue;
				}
				throw new Error("Fluid state contains an unknown record kind");
			}
			const network = this.#newNetwork();
			for (const entry of tanks.values())
				network.registerPort(entry.tank);
			const externalPorts = new Map();
			for (const record of externalPortRecords) {
				const entry = this.#externalPortFromRecord(record);
				if (tanks.has(entry.port.id) || externalPorts.has(entry.port.id))
					throw new Error(`Fluid state contains duplicate port ${entry.port.id}`);
				network.registerPort(entry.port);
				externalPorts.set(entry.port.id, entry);
			}
			for (const retirement of retirements.values()) {
				const port = externalPorts.get(retirement.portId);
				if (!port || retirement.partition !== port.partition)
					throw new Error("Fluid escrow retirement does not match a persistent external source");
			}
			const links = linkRecords.map(record => {
				const source = tanks.get(record.link?.sourceId) ?? externalPorts.get(record.link?.sourceId);
				if (!source || record.partition !== this.#partitionForEntry(source))
					throw new Error("Fluid link partition does not match its source tank");
				return record.link;
			});
			network.restore({ links, roundRobinAfter, transfers });
			this.#frozen = false;
			this.#network = network;
			this.#externalPorts = externalPorts;
			this.#retirements = retirements;
			this.#tanks = tanks;
			this.#retireCommittedExternalEscrows();
			if (this.#frozen)
				return { frozen: true, links: 0, tanks: 0, transfers: 0, warnings: [{ error: "Fluid escrow retirement could not be recovered", partition: "fluid:network" }] };
			return { frozen: false, links: links.length, tanks: tanks.size, transfers: transfers.length, warnings: [] };
		} catch (error) {
			this.#freeze(`Fluid state restore rejected: ${error}`);
			return { frozen: true, links: 0, tanks: 0, transfers: 0, warnings: [{ error: String(error), partition: "fluid:network" }] };
		}
	}

	setPipeOpen(id, open) {
		this.#assertActive();
		const changed = this.#network.setPipeOpen(id, open);
		if (changed)
			this.#persist();
		return changed;
	}

	setPipeFilter(id, filter) {
		this.#assertActive();
		const changed = this.#network.setPipeFilter(id, filter);
		if (changed)
			this.#persist();
		return changed;
	}

	setPumpRunning(id, running) {
		this.#assertActive();
		const changed = this.#network.setPumpRunning(id, running);
		if (changed)
			this.#persist();
		return changed;
	}

	snapshot() {
		return this.#records();
	}

	tick() {
		const wrote = this.#store.tick();
		if (wrote || this.#persistencePending() || this.#frozen)
			return wrote;
		const result = this.#network.tick();
		const uncertain = result.outcomes.find(outcome => outcome.reason === "source_uncertain" || outcome.reason === "destination_uncertain");
		if (uncertain) {
			this.#freeze(`Fluid transfer ${uncertain.id} has an unresolved world-state conflict`);
			return wrote;
		}
		try {
			for (const transfer of this.#network.takeCompletedTransfers())
				this.#queueExternalEscrowRetirement(transfer);
		} catch (error) {
			this.#freeze(`Fluid escrow retirement could not be scheduled: ${error}`);
			return wrote;
		}
		if (result.processed > 0)
			this.#persist();
		return wrote || result.processed > 0;
	}

	#assertActive() {
		if (this.#frozen)
			throw new Error("Fluid state is frozen pending administrator recovery");
	}

	#freeze(message) {
		this.#frozen = true;
		this.#report(new Error(message));
	}

	#newNetwork() {
		return new FluidNetwork(this.#transfersPerTick === undefined ? {} : { transfersPerTick: this.#transfersPerTick });
	}

	#persistencePending() {
		const diagnostics = this.#store.diagnostics();
		return diagnostics.dirty || diagnostics.pendingActions > 0;
	}

	#persist() {
		try {
			this.#store.request(this.#records());
		} catch (error) {
			this.#freeze(`Fluid state could not be persisted: ${error}`);
		}
	}

	#records() {
		const tanks = [...this.#tanks.values()].map(entry => ({
			dimensionId: entry.dimensionId,
			kind: "tank",
			location: { ...entry.location },
			partition: sectionKey(entry.dimensionId, entry.location),
			tank: entry.tank.snapshot()
	}));
		const network = this.#network.snapshot();
		const externalPorts = [...this.#externalPorts.values()].map(entry => ({
			descriptor: clone(entry.descriptor),
			id: entry.port.id,
			kind: "external_port",
			partition: entry.partition
		}));
		const links = network.links.map(link => ({
			kind: "link",
			link,
			partition: this.#partitionForPort(link.sourceId)
		}));
		const transfers = network.transfers.map(transfer => ({
			kind: "transfer",
			partition: transfer.partition,
			transfer
		}));
		return [
			...tanks,
			...externalPorts,
			...links,
			...transfers,
			...[...this.#retirements.values()].map(retirement => ({
				kind: "external_escrow_retirement",
				partition: retirement.partition,
				portId: retirement.portId,
				reservation: clone(retirement.reservation),
				retirementId: retirement.retirementId
			})),
			{ kind: "network", partition: "fluid:network", roundRobinAfter: network.roundRobinAfter }
		];
	}

	#report(error) {
		this.#onError(error instanceof Error ? error : new Error(String(error)));
	}

	#requireTank(id) {
		const tank = this.#tanks.get(id);
		if (!tank)
			throw new Error(`Unknown fluid tank ${id}`);
		return tank;
	}

	#externalPortFromRecord(record) {
		if (typeof record?.id !== "string" || record.id.length === 0)
			throw new TypeError("External fluid port records require identifiers");
		const descriptor = cloneExternalDescriptor(record.descriptor);
		const partition = assertPartition(record.partition);
		if (!this.#externalPortFactory)
			throw new Error(`Fluid state requires external port ${record.id}, but no factory is configured`);
		const port = this.#externalPortFactory({ descriptor: clone(descriptor), id: record.id });
		if (!port || port.id !== record.id)
			throw new Error(`Fluid external-port factory could not restore ${record.id}`);
		return { descriptor, partition, port };
	}

	#queueExternalEscrowRetirement(transfer) {
		if (typeof transfer?.id !== "string" || typeof transfer.sourceId !== "string" || typeof transfer.destinationId !== "string")
			throw new Error("Completed fluid transfers require stable identifiers");
		const candidates = [
			{ portId: transfer.sourceId, reservation: transfer.reservation },
			{ portId: transfer.destinationId, reservation: transfer.delivery }
		];
		const retiredEscrows = new Set();
		for (const candidate of candidates) {
			if (!candidate.reservation?.escrowId || retiredEscrows.has(candidate.reservation.escrowId))
				continue;
			const port = this.#network.getPort(candidate.portId);
			if (!port || typeof port.finalizeReservation !== "function")
				throw new Error(`Fluid port ${candidate.portId} cannot retire its escrow`);
			const retirementId = `${transfer.id}:${candidate.portId}`;
			this.#retirements.set(retirementId, {
				partition: this.#partitionForPort(candidate.portId),
				portId: candidate.portId,
				reservation: clone(candidate.reservation),
				retirementId
			});
			retiredEscrows.add(candidate.reservation.escrowId);
		}
	}

	#retirementFromRecord(record) {
		const portId = record?.portId ?? record?.sourceId;
		const retirementId = record?.retirementId ?? record?.transferId;
		if (typeof portId !== "string" || typeof retirementId !== "string" || retirementId.length === 0)
			throw new TypeError("External fluid escrow retirements require identifiers");
		const reservation = clone(record.reservation);
		if (!reservation || typeof reservation.escrowId !== "string" || reservation.escrowId.length === 0)
			throw new TypeError("External fluid escrow retirements require escrow reservations");
		return {
			partition: assertPartition(record.partition),
			portId,
			reservation,
			retirementId
		};
	}

	#retireCommittedExternalEscrows() {
		if (this.#retirements.size === 0 || this.#frozen)
			return;
		let changed = false;
		for (const retirement of [...this.#retirements.values()]) {
			try {
				const port = this.#network.getPort(retirement.portId);
				if (!port || typeof port.finalizeReservation !== "function")
					throw new Error(`Fluid port ${retirement.portId} cannot retire its escrow`);
				if (port.finalizeReservation(retirement.reservation) === false)
					continue;
				this.#retirements.delete(retirement.retirementId);
				changed = true;
			} catch (error) {
				this.#freeze(`Fluid escrow retirement failed: ${error}`);
				return;
			}
		}
		if (changed)
			this.#persist();
	}

	#partitionForEntry(entry) {
		return entry.partition ?? sectionKey(entry.dimensionId, entry.location);
	}

	#partitionForPort(id) {
		const entry = this.#tanks.get(id) ?? this.#externalPorts.get(id);
		if (!entry)
			throw new Error(`Unknown fluid port ${id}`);
		return this.#partitionForEntry(entry);
	}

	#tankFromRecord(record) {
		if (typeof record.dimensionId !== "string" || !record.location || !record.tank)
			throw new TypeError("Fluid tank records require a dimension, location, and tank state");
		const location = assertLocation(record.location);
		const id = fluidTankId(record.dimensionId, location);
		if (record.partition !== sectionKey(record.dimensionId, location) || record.tank.id !== id)
			throw new Error("Fluid tank identity does not match its persisted location");
		const tank = new FluidTank({ capacity: record.tank.capacity, id });
		tank.restore(record.tank);
		return { dimensionId: record.dimensionId, location, tank };
	}
}
