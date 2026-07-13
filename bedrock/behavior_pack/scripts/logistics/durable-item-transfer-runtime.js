import { ShardedStateStore } from "../kernel/sharded-state-store.js";
import { ItemTransferJournal, transferPartition } from "./item-transfer-journal.js";

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function isManagedPort(port) {
	return port?.transactionStorage === "managed" && typeof port.snapshot === "function" && typeof port.restore === "function";
}

function portPartition(id) {
	return transferPartition(`port:${id}`).replace("transaction:", "port:");
}

export class DurableItemTransferRuntime {
	#blockedPortIds = new Set();
	#cooldownTicks = 0;
	#detachedPortSnapshots = new Map();
	#frozen = false;
	#journal;
	#onError;
	#resolvePort;
	#retryIntervalTicks;
	#store;
	#trackedPortIds = new Set();
	#waitingForCommit = false;

	constructor({ keyPrefix, onError, resolvePort, retryIntervalTicks = 20, storage, writesPerTick }) {
		if (typeof resolvePort !== "function")
			throw new TypeError("Durable item transfers require a port resolver");
		if (!Number.isInteger(retryIntervalTicks) || retryIntervalTicks < 1)
			throw new RangeError("Durable item transfers require a positive retry interval");
		if (onError !== undefined && typeof onError !== "function")
			throw new TypeError("Durable item transfer error handlers must be functions");

		this.#onError = onError ?? (() => {});
		this.#resolvePort = resolvePort;
		this.#retryIntervalTicks = retryIntervalTicks;
		this.#journal = new ItemTransferJournal();
		this.#store = new ShardedStateStore({
			keyPrefix,
			onCommit: () => {
				this.#waitingForCommit = false;
				if (this.#compactManagedReceipts() > 0)
					this.#queueReceiptCompaction();
			},
			onError: error => this.#report(error),
			partitionFor: record => record.partition,
			storage,
			writesPerTick
		});
	}

	begin({ destination, ...options }) {
		this.#requireManagedPort(options.source, "source");
		if (typeof destination?.insert === "function")
			this.#requireManagedPort(destination, "destination");
		this.#trackPort(options.source.id);
		this.#trackPort(destination?.id);
		const result = this.#journal.begin({ destination, ...options });
		if (result.ok)
			this.#persist();
		return result;
	}

	diagnostics() {
		return {
			blockedPorts: this.#blockedPortIds.size,
			cooldownTicks: this.#cooldownTicks,
			frozen: this.#frozen,
			journalRecords: this.#journal.snapshot().length,
			trackedPorts: this.#trackedPortIds.size,
			waitingForCommit: this.#waitingForCommit,
			...this.#store.diagnostics()
		};
	}

	restore() {
		const restored = this.#store.read();
		if (!restored)
			return { records: 0, warnings: [] };
		const transfers = [];
		for (const record of restored.records) {
			if (record?.kind === "port") {
				try {
					this.#restorePortSnapshot(record);
				} catch (error) {
					this.#frozen = true;
					this.#report(new Error(`Cannot restore managed item-port snapshot: ${error}`));
				}
				continue;
			}
			if (record?.kind === "transfer") {
				const { kind, ...transfer } = record;
				transfers.push(transfer);
				continue;
			}
			// v1 stored bare transfer records. Continue reading it while all new
			// writes include managed-port snapshots in the same root commit.
			transfers.push(record);
		}
		this.#journal.restore(transfers);
		for (const warning of restored.warnings)
			this.#report(new Error(`Ignored corrupt item-transfer shard ${warning.partition}: ${warning.error}`));
		if (!this.#frozen && this.#compactManagedReceipts() > 0)
			this.#queueReceiptCompaction();
		return { records: transfers.length, warnings: restored.warnings };
	}

	snapshot() {
		return this.#journal.snapshot();
	}

	tick() {
		const wrote = this.#store.tick();
		// A root-pointer write makes the journal durable, but deliberately defer
		// external inventory mutation to the next tick. This creates an observable
		// recovery point containing the intent before any source stack is removed.
		if (wrote || this.#waitingForCommit || this.#frozen)
			return wrote;
		if (this.#cooldownTicks > 0) {
			this.#cooldownTicks--;
			return wrote;
		}

		const record = this.#journal.snapshot()[0];
		if (!record || this.#recordHasBlockedPort(record))
			return wrote;
		const result = record.state === "intent"
			? this.#journal.extract(record.id, id => this.#managedPort(id))
			: this.#journal.deliver(record.id, id => this.#managedPort(id));
		if (result.ok || result.reason === "source_changed" || result.reason === "destination_full")
			this.#persist();
		if (!result.ok)
			this.#cooldownTicks = this.#retryIntervalTicks;
		return true;
	}

	#blockPort(id, error) {
		if (this.#blockedPortIds.has(id))
			return;
		this.#blockedPortIds.add(id);
		this.#report(error);
	}

	#managedPort(id) {
		let port;
		try {
			port = this.#resolvePort(id);
		} catch (error) {
			this.#blockPort(id, new Error(`Cannot resolve item port ${id}: ${error}`));
			return undefined;
		}
		if (!port)
			return undefined;
		if (!isManagedPort(port)) {
			this.#blockPort(id, new Error(`Item port ${id} is not managed by the durable transaction store`));
			return undefined;
		}
		return port;
	}

	#persist() {
		try {
			this.#store.request(this.#records());
			this.#waitingForCommit = true;
		} catch (error) {
			this.#frozen = true;
			this.#report(error);
		}
	}

	#compactManagedReceipts() {
		let removed = 0;
		for (const id of [...this.#trackedPortIds].sort()) {
			const port = this.#managedPort(id);
			if (!port || typeof port.compactReceipts !== "function")
				continue;
			try {
				const count = port.compactReceipts();
				if (!Number.isInteger(count) || count < 0)
					throw new TypeError("managed item-port receipt compaction must return a non-negative integer");
				removed += count;
			} catch (error) {
				this.#report(new Error(`Cannot compact managed item-port receipts for ${id}: ${error}`));
			}
		}
		return removed;
	}

	#queueReceiptCompaction() {
		try {
			this.#store.request(this.#records());
			this.#waitingForCommit = true;
		} catch (error) {
			// Receipt compaction controls persistent growth but cannot invalidate a
			// root that already made the item ownership transition durable.
			this.#report(new Error(`Cannot persist managed item-port receipt compaction: ${error}`));
		}
	}

	#records() {
		const transfers = this.#journal.snapshot().map(record => ({ ...record, kind: "transfer" }));
		const ports = [];
		for (const id of [...this.#trackedPortIds].sort()) {
			const port = this.#managedPort(id);
			const snapshot = port ? port.snapshot() : this.#detachedPortSnapshots.get(id);
			if (snapshot === undefined)
				continue;
			ports.push({ id, kind: "port", partition: portPartition(id), snapshot: clone(snapshot) });
		}
		return [...transfers, ...ports];
	}

	#recordHasBlockedPort(record) {
		return this.#blockedPortIds.has(record.sourceId) || this.#blockedPortIds.has(record.destinationId);
	}

	#report(error) {
		this.#onError(error instanceof Error ? error : new Error(String(error)));
	}

	#requireManagedPort(port, role) {
		if (!isManagedPort(port))
			throw new TypeError(`Durable item transfer ${role} ports must use managed transaction storage`);
	}

	#restorePortSnapshot(record) {
		if (typeof record?.id !== "string" || record.id.length === 0 || typeof record.partition !== "string" || record.partition !== portPartition(record.id) || record.snapshot === undefined)
			throw new TypeError("Managed item-port records require a stable identifier and snapshot");
		this.#trackPort(record.id);
		this.#detachedPortSnapshots.set(record.id, clone(record.snapshot));
		const port = this.#managedPort(record.id);
		if (!port) {
			this.#blockPort(record.id, new Error(`Cannot restore managed item port ${record.id}`));
			return;
		}
		try {
			port.restore(record.snapshot);
			this.#detachedPortSnapshots.delete(record.id);
			this.#blockedPortIds.delete(record.id);
		} catch (error) {
			this.#blockPort(record.id, new Error(`Cannot restore managed item port ${record.id}: ${error}`));
		}
	}

	#trackPort(id) {
		if (typeof id !== "string" || id.length === 0)
			throw new TypeError("Durable item-transfer ports require identifiers");
		this.#trackedPortIds.add(id);
	}
}
