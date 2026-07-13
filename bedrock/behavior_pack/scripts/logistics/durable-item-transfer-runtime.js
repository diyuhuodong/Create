import { ShardedStateStore } from "../kernel/sharded-state-store.js";
import { ItemTransferJournal } from "./item-transfer-journal.js";

export class DurableItemTransferRuntime {
	#cooldownTicks = 0;
	#journal;
	#onError;
	#resolvePort;
	#retryIntervalTicks;
	#store;
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
			},
			onError: error => this.#report(error),
			partitionFor: record => record.partition,
			storage,
			writesPerTick
		});
	}

	begin(options) {
		const result = this.#journal.begin(options);
		if (result.ok)
			this.#persist();
		return result;
	}

	diagnostics() {
		return {
			cooldownTicks: this.#cooldownTicks,
			journalRecords: this.#journal.snapshot().length,
			waitingForCommit: this.#waitingForCommit,
			...this.#store.diagnostics()
		};
	}

	restore() {
		const restored = this.#store.read();
		if (!restored)
			return { records: 0, warnings: [] };
		this.#journal.restore(restored.records);
		for (const warning of restored.warnings)
			this.#report(new Error(`Ignored corrupt item-transfer shard ${warning.partition}: ${warning.error}`));
		return { records: restored.records.length, warnings: restored.warnings };
	}

	snapshot() {
		return this.#journal.snapshot();
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
			? this.#journal.extract(record.id, this.#resolvePort)
			: this.#journal.deliver(record.id, this.#resolvePort);
		if (result.ok || result.reason === "source_changed" || result.reason === "destination_full")
			this.#persist();
		if (!result.ok)
			this.#cooldownTicks = this.#retryIntervalTicks;
		return true;
	}

	#persist() {
		try {
			this.#store.request(this.#journal.snapshot());
			this.#waitingForCommit = true;
		} catch (error) {
			this.#report(error);
		}
	}

	#report(error) {
		this.#onError(error instanceof Error ? error : new Error(String(error)));
	}
}
