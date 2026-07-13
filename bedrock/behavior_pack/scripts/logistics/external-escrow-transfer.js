import { ShardedStateStore } from "../kernel/sharded-state-store.js";
import { cloneItemStack, itemStackFingerprint } from "./item-port.js";
import { transferPartition } from "./item-transfer-journal.js";

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function assertContainer(container, name, { movable = false } = {}) {
	if (!container || !Number.isInteger(container.size) || container.size < 1 || typeof container.getItem !== "function" || (movable && typeof container.moveItem !== "function"))
		throw new TypeError(`${name} requires a readable${movable ? " movable" : ""} container`);
	return container;
}

function assertPort(port, name) {
	if (!port || typeof port.id !== "string" || port.id.length === 0)
		throw new TypeError(`${name} requires a stable identifier`);
	assertContainer(port.container, name, { movable: true });
	return port;
}

function assertSlot(container, slot, name) {
	if (!Number.isInteger(slot) || slot < 0 || slot >= container.size)
		throw new RangeError(`${name} slot is outside its container`);
	return slot;
}

function sameStack(left, right) {
	if (left === undefined || right === undefined)
		return left === right;
	return left.count === right.count && itemStackFingerprint(left) === itemStackFingerprint(right);
}

function validateRecord(record) {
	if (!record || typeof record.id !== "string" || record.id.length === 0 || typeof record.escrowId !== "string" || record.escrowId.length === 0 || record.partition !== transferPartition(record.id))
		throw new TypeError("External escrow transfers require stable identifiers and a transaction partition");
	if (record.state !== "intent" && record.state !== "escrowed")
		throw new TypeError("External escrow transfers require an intent or escrowed state");
	for (const endpoint of [record.source, record.destination]) {
		if (!endpoint || typeof endpoint.portId !== "string" || endpoint.portId.length === 0 || !Number.isInteger(endpoint.slot) || endpoint.slot < 0)
			throw new TypeError("External escrow transfers require source and destination slots");
	}
	cloneItemStack(record.item);
}

/**
 * Moves a complete external-container slot through a private escrow container.
 * The native container move is always followed by readback: recovery can then
 * identify whether the item is still at the source, owned by escrow, or has
 * already reached the planned destination. Partial stacks are intentionally
 * out of scope until a native partial-transfer receipt is available.
 */
export class ExternalEscrowTransferRuntime {
	#cooldownTicks = 0;
	#decodeStack;
	#destroyEscrow;
	#frozen = false;
	#onError;
	#records = new Map();
	#resolveEscrow;
	#resolvePort;
	#retireEscrowIds = new Set();
	#retryIntervalTicks;
	#store;
	#waitingForCommit = false;

	constructor({ createEscrow, decodeStack, destroyEscrow, keyPrefix, onError, resolveEscrow, resolvePort, retryIntervalTicks = 20, storage, writesPerTick }) {
		if (typeof createEscrow !== "function" || typeof resolveEscrow !== "function" || typeof resolvePort !== "function")
			throw new TypeError("External escrow transfers require escrow and port resolvers");
		if (typeof decodeStack !== "function")
			throw new TypeError("External escrow transfers require a stack decoder");
		if (destroyEscrow !== undefined && typeof destroyEscrow !== "function")
			throw new TypeError("External escrow destroy handlers must be functions");
		if (onError !== undefined && typeof onError !== "function")
			throw new TypeError("External escrow error handlers must be functions");
		if (!Number.isInteger(retryIntervalTicks) || retryIntervalTicks < 1)
			throw new RangeError("External escrow transfers require a positive retry interval");

		this.#decodeStack = decodeStack;
		this.#destroyEscrow = destroyEscrow;
		this.#onError = onError ?? (() => {});
		this.#resolveEscrow = resolveEscrow;
		this.#resolvePort = resolvePort;
		this.#retryIntervalTicks = retryIntervalTicks;
		this.#store = new ShardedStateStore({
			keyPrefix,
			onCommit: () => {
				this.#waitingForCommit = false;
			},
			onError: error => this.#report(error),
			partitionFor: record => record.partition,
			storage,
			writesPerTick
		});
		this.#createEscrow = createEscrow;
	}

	#createEscrow;

	begin({ destination, id, source }) {
		if (typeof id !== "string" || id.length === 0)
			throw new TypeError("External escrow transfers require an identifier");
		if (this.#records.has(id))
			throw new Error(`External escrow transfer ${id} already exists`);
		const sourceEndpoint = this.#endpoint(source, "Source");
		const destinationEndpoint = this.#endpoint(destination, "Destination");
		const item = this.#read(sourceEndpoint.container, sourceEndpoint.slot);
		if (!item)
			return { ok: false, reason: "source_empty" };
		if (this.#read(destinationEndpoint.container, destinationEndpoint.slot))
			return { ok: false, reason: "destination_occupied" };
		const escrow = this.#createEscrow({ id, source });
		if (!escrow || typeof escrow.id !== "string" || escrow.id.length === 0)
			throw new TypeError("External escrow factories must return stable identifiers");
		assertContainer(escrow.container, "External escrow", { movable: true });
		if (escrow.container.size !== 1 || this.#read(escrow.container, 0))
			throw new Error("External escrow containers must expose one empty slot");

		const record = {
			destination: { portId: destinationEndpoint.id, slot: destinationEndpoint.slot },
			escrowId: escrow.id,
			id,
			item,
			partition: transferPartition(id),
			source: { portId: sourceEndpoint.id, slot: sourceEndpoint.slot },
			state: "intent"
		};
		this.#records.set(id, record);
		this.#persist();
		return { ok: true, record: clone(record) };
	}

	activeEscrowIds() {
		return new Set([
			...[...this.#records.values()].map(record => record.escrowId),
			...this.#retireEscrowIds
		]);
	}

	diagnostics() {
		return {
			cooldownTicks: this.#cooldownTicks,
			frozen: this.#frozen,
			records: this.#records.size,
			retiringEscrows: this.#retireEscrowIds.size,
			waitingForCommit: this.#waitingForCommit,
			...this.#store.diagnostics()
		};
	}

	restore() {
		const restored = this.#store.read();
		if (!restored)
			return { records: 0, warnings: [] };
		const records = new Map();
		for (const record of restored.records) {
			try {
				validateRecord(record);
				if (records.has(record.id))
					throw new Error(`duplicate external escrow transfer ${record.id}`);
				records.set(record.id, clone(record));
			} catch (error) {
				this.#frozen = true;
				this.#report(new Error(`Cannot restore external escrow transfer: ${error}`));
			}
		}
		this.#records = records;
		for (const warning of restored.warnings)
			this.#report(new Error(`Ignored corrupt external-escrow shard ${warning.partition}: ${warning.error}`));
		return { records: records.size, warnings: restored.warnings };
	}

	snapshot() {
		return [...this.#records.values()].map(clone).sort((left, right) => left.id.localeCompare(right.id));
	}

	tick() {
		const wrote = this.#store.tick();
		// An escrow is eligible for native removal only after the root record that
		// forgets it has committed. Retrying here also handles a transient entity
		// invalidation without making an otherwise-complete transfer permanent.
		if (!this.#waitingForCommit)
			this.#retireCommittedEscrows();
		if (wrote || this.#waitingForCommit || this.#frozen)
			return wrote;
		if (this.#cooldownTicks > 0) {
			this.#cooldownTicks--;
			return wrote;
		}
		const record = [...this.#records.values()].sort((left, right) => left.id.localeCompare(right.id))[0];
		if (!record)
			return wrote;
		const result = record.state === "intent" ? this.#moveToEscrow(record) : this.#moveToDestination(record);
		if (!result.ok)
			this.#cooldownTicks = this.#retryIntervalTicks;
		return true;
	}

	#endpoint(port, name) {
		assertPort(port, name);
		return { container: port.container, id: port.id, slot: assertSlot(port.container, port.slot, name) };
	}

	#freeze(error) {
		this.#frozen = true;
		this.#report(error);
		return { ok: false, reason: "uncertain" };
	}

	#moveToDestination(record) {
		const escrow = this.#escrow(record);
		const destination = this.#resolvedEndpoint(record.destination, "Destination");
		if (!escrow || !destination)
			return { ok: false, reason: "endpoint_unavailable" };
		const escrowStack = this.#read(escrow.container, 0);
		const destinationStack = this.#read(destination.container, destination.slot);
		if (sameStack(destinationStack, record.item) && escrowStack === undefined)
			return this.#commit(record);
		if (!sameStack(escrowStack, record.item)) {
			if (escrowStack === undefined && destinationStack === undefined)
				return this.#freeze(new Error(`External escrow ${record.escrowId} lost its item`));
			return this.#freeze(new Error(`External escrow transfer ${record.id} has conflicting destination ownership`));
		}
		if (destinationStack !== undefined)
			return { ok: false, reason: "destination_occupied" };
		return this.#moveAndVerify({
			from: escrow.container,
			fromSlot: 0,
			record,
			to: destination.container,
			toSlot: destination.slot,
			verify: () => sameStack(this.#read(destination.container, destination.slot), record.item) && this.#read(escrow.container, 0) === undefined,
			onSuccess: () => this.#commit(record)
		});
	}

	#moveToEscrow(record) {
		const source = this.#resolvedEndpoint(record.source, "Source");
		const escrow = this.#escrow(record);
		if (!source || !escrow)
			return { ok: false, reason: "endpoint_unavailable" };
		const sourceStack = this.#read(source.container, source.slot);
		const escrowStack = this.#read(escrow.container, 0);
		if (sameStack(escrowStack, record.item) && sourceStack === undefined) {
			record.state = "escrowed";
			this.#persist();
			return { ok: true, state: "escrowed" };
		}
		if (!sameStack(sourceStack, record.item)) {
			if (escrowStack === undefined) {
				this.#records.delete(record.id);
				this.#retireEscrowIds.add(record.escrowId);
				this.#persist();
				return { ok: true, state: "cancelled" };
			}
			return this.#freeze(new Error(`External escrow transfer ${record.id} has conflicting source ownership`));
		}
		if (escrowStack !== undefined)
			return this.#freeze(new Error(`External escrow ${record.escrowId} is unexpectedly occupied`));
		return this.#moveAndVerify({
			from: source.container,
			fromSlot: source.slot,
			record,
			to: escrow.container,
			toSlot: 0,
			verify: () => source.container.getItem(source.slot) === undefined && sameStack(this.#read(escrow.container, 0), record.item),
			onSuccess: () => {
				record.state = "escrowed";
				this.#persist();
				return { ok: true, state: "escrowed" };
			}
		});
	}

	#moveAndVerify({ from, fromSlot, onSuccess, record, to, toSlot, verify }) {
		let error;
		try {
			from.moveItem(fromSlot, toSlot, to);
		} catch (caught) {
			error = caught;
		}
		try {
			if (verify())
				return onSuccess();
		} catch (verificationError) {
			return this.#freeze(new Error(`Cannot verify external escrow transfer ${record.id}: ${verificationError}`));
		}
		if (error)
			this.#report(new Error(`External escrow move ${record.id} was rejected: ${error}`));
		return { ok: false, reason: "move_rejected" };
	}

	#escrow(record) {
		let escrow;
		try {
			escrow = this.#resolveEscrow(record.escrowId, record.id);
		} catch (error) {
			this.#report(new Error(`Cannot resolve external escrow ${record.escrowId}: ${error}`));
			return undefined;
		}
		if (!escrow)
			return undefined;
		try {
			if (escrow.id !== record.escrowId)
				throw new Error("identifier mismatch");
			assertContainer(escrow.container, "External escrow", { movable: true });
			if (escrow.container.size !== 1)
				throw new Error("must contain exactly one slot");
			return escrow;
		} catch (error) {
			this.#report(new Error(`Cannot resolve external escrow ${record.escrowId}: ${error}`));
			return undefined;
		}
	}

	#persist() {
		try {
			this.#store.request(this.snapshot());
			this.#waitingForCommit = true;
		} catch (error) {
			this.#freeze(error);
		}
	}

	#read(container, slot) {
		const physical = container.getItem(slot);
		return physical === undefined ? undefined : cloneItemStack(this.#decodeStack(physical));
	}

	#resolvedEndpoint(endpoint, name) {
		let port;
		try {
			port = this.#resolvePort(endpoint.portId);
		} catch (error) {
			this.#report(new Error(`Cannot resolve external ${name.toLowerCase()} port ${endpoint.portId}: ${error}`));
			return undefined;
		}
		if (!port)
			return undefined;
		try {
			assertPort(port, name);
			return { container: port.container, id: port.id, slot: assertSlot(port.container, endpoint.slot, name) };
		} catch (error) {
			this.#report(new Error(`Cannot resolve external ${name.toLowerCase()} port ${endpoint.portId}: ${error}`));
			return undefined;
		}
	}

	#retireCommittedEscrows() {
		if (!this.#destroyEscrow)
			return;
		for (const escrowId of [...this.#retireEscrowIds]) {
			try {
				this.#destroyEscrow(escrowId);
				this.#retireEscrowIds.delete(escrowId);
			} catch (error) {
				this.#report(new Error(`Cannot retire external escrow ${escrowId}: ${error}`));
			}
		}
	}

	#commit(record) {
		this.#records.delete(record.id);
		this.#retireEscrowIds.add(record.escrowId);
		this.#persist();
		return { ok: true, state: "committed" };
	}

	#report(error) {
		this.#onError(error instanceof Error ? error : new Error(String(error)));
	}
}
