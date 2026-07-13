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
	#frozen = false;
	#network;
	#onError;
	#store;
	#tanks = new Map();
	#transfersPerTick;

	constructor({ keyPrefix = "createbedrock:fluid_state_v1", onError, storage, transfersPerTick, writesPerTick }) {
		if (onError !== undefined && typeof onError !== "function")
			throw new TypeError("Fluid network error handlers must be functions");
		this.#onError = onError ?? (() => {});
		this.#transfersPerTick = transfersPerTick;
		this.#network = this.#newNetwork();
		this.#store = new ShardedStateStore({
			keyPrefix,
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

	links() {
		return this.#network.snapshot().links;
	}

	canRemoveTank(id) {
		const tank = this.#tanks.get(id);
		if (!tank)
			return true;
		const state = this.#network.snapshot();
		if (state.links.some(link => link.sourceId === id || link.destinationId === id))
			return false;
		if (state.transfers.some(transfer => transfer.sourceId === id || transfer.destinationId === id))
			return false;
		return tank.tank.inspect().contents === undefined;
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
			frozen: this.#frozen,
			tanks: this.#tanks.size,
			waitingForCommit: this.#persistencePending(),
			...this.#network.diagnostics(),
			...this.#store.diagnostics()
		};
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
			const linkRecords = [];
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
				throw new Error("Fluid state contains an unknown record kind");
			}
			const network = this.#newNetwork();
			for (const entry of tanks.values())
				network.registerPort(entry.tank);
			const links = linkRecords.map(record => {
				const source = tanks.get(record.link?.sourceId);
				if (!source || record.partition !== sectionKey(source.dimensionId, source.location))
					throw new Error("Fluid link partition does not match its source tank");
				return record.link;
			});
			network.restore({ links, roundRobinAfter, transfers });
			this.#frozen = false;
			this.#network = network;
			this.#tanks = tanks;
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
		if (this.#persistencePending() || this.#frozen)
			return wrote;
		const result = this.#network.tick();
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
		const links = network.links.map(link => ({
			kind: "link",
			link,
			partition: sectionKey(this.#requireTank(link.sourceId).dimensionId, this.#requireTank(link.sourceId).location)
	}));
		const transfers = network.transfers.map(transfer => ({
			kind: "transfer",
			partition: transfer.partition,
			transfer
		}));
		return [
			...tanks,
			...links,
			...transfers,
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
