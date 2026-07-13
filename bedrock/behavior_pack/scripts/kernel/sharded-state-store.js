const STORE_SCHEMA_VERSION = 1;

function checksum(value) {
	let hash = 0x811c9dc5;
	for (let index = 0; index < value.length; index++) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

function cloneRecords(records) {
	try {
		const serialized = JSON.stringify(records);
		if (typeof serialized !== "string")
			throw new TypeError("Persistent records must be JSON serializable");
		return JSON.parse(serialized);
	} catch (error) {
		throw new TypeError(`Persistent records must be JSON serializable: ${error}`);
	}
}

function parseJson(value, name) {
	if (typeof value !== "string")
		throw new TypeError(`${name} must be a JSON string`);
	try {
		return JSON.parse(value);
	} catch (error) {
		throw new Error(`Invalid ${name}: ${error}`);
	}
}

function validateGeneration(generation) {
	if (generation !== 0 && generation !== 1)
		throw new Error("Persistent state generations must be zero or one");
}

export class ShardedStateStore {
	#activeGeneration;
	#commits = 0;
	#dirty = false;
	#failures = 0;
	#keyPrefix;
	#lastError;
	#latestRecords;
	#maxIndexEntries;
	#maxShardCharacters;
	#onCommit;
	#onError;
	#partitionFor;
	#plan;
	#storage;
	#writes = 0;
	#writesPerTick;

	constructor({ keyPrefix, maxIndexEntries = 96, maxShardCharacters = 12_288, onCommit, onError, partitionFor, storage, writesPerTick = 2 }) {
		if (typeof keyPrefix !== "string" || !/^[a-z0-9._-]+:[a-z0-9._-]+$/.test(keyPrefix))
			throw new TypeError("Sharded state stores require a namespaced key prefix");
		if (!Number.isInteger(maxIndexEntries) || maxIndexEntries < 1)
			throw new RangeError("Sharded state store index pages require a positive entry limit");
		if (!Number.isInteger(maxShardCharacters) || maxShardCharacters < 128)
			throw new RangeError("Sharded state store shards require a practical character limit");
		if (!Number.isInteger(writesPerTick) || writesPerTick < 1)
			throw new RangeError("Sharded state stores require a positive write budget");
		if (typeof partitionFor !== "function")
			throw new TypeError("Sharded state stores require a partition function");
		if (!storage || typeof storage.get !== "function" || typeof storage.set !== "function" || typeof storage.delete !== "function")
			throw new TypeError("Sharded state stores require get, set, and delete storage operations");
		if (onCommit !== undefined && typeof onCommit !== "function")
			throw new TypeError("Sharded state store commit handlers must be functions");
		if (onError !== undefined && typeof onError !== "function")
			throw new TypeError("Sharded state store error handlers must be functions");

		this.#keyPrefix = keyPrefix;
		this.#maxIndexEntries = maxIndexEntries;
		this.#maxShardCharacters = maxShardCharacters;
		this.#onCommit = onCommit ?? (() => {});
		this.#onError = onError ?? (() => {});
		this.#partitionFor = partitionFor;
		this.#storage = storage;
		this.#writesPerTick = writesPerTick;
	}

	request(records) {
		if (!Array.isArray(records))
			throw new TypeError("Sharded state store records must be an array");
		this.#latestRecords = cloneRecords(records);
		this.#dirty = true;
	}

	tick() {
		if (!this.#plan && this.#dirty) {
			try {
				this.#plan = this.#createPlan(this.#latestRecords);
				this.#dirty = false;
			} catch (error) {
				this.#recordError(error);
				return false;
			}
		}
		if (!this.#plan)
			return false;

		let wrote = false;
		for (let budget = 0; budget < this.#writesPerTick && this.#plan.cursor < this.#plan.actions.length; budget++) {
			const action = this.#plan.actions[this.#plan.cursor];
			try {
				if (action.type === "delete")
					this.#storage.delete(action.key);
				else
					this.#storage.set(action.key, action.value);
				this.#plan.cursor++;
				this.#writes++;
				wrote = true;
			} catch (error) {
				this.#recordError(error);
				return wrote;
			}
		}

		if (this.#plan.cursor === this.#plan.actions.length) {
			const committed = this.#plan;
			this.#plan = undefined;
			this.#activeGeneration = committed.generation;
			this.#commits++;
			try {
				this.#onCommit(committed.generation);
			} catch (error) {
				this.#recordError(error);
			}
		}
		return wrote;
	}

	read() {
		const rootValue = this.#storage.get(this.#rootKey());
		if (rootValue === undefined)
			return undefined;

		const root = this.#parseRoot(rootValue);
		this.#activeGeneration = root.activeGeneration;
		const metadata = root.generations[root.activeGeneration];
		const records = [];
		const warnings = [];
		for (let page = 0; page < metadata.indexPages; page++) {
			const index = this.#parseIndex(this.#storage.get(this.#indexKey(root.activeGeneration, page)), root.activeGeneration, page);
			for (const descriptor of index.entries) {
				try {
					const shard = this.#parseShard(this.#storage.get(this.#shardKey(root.activeGeneration, descriptor.shard)), root.activeGeneration, descriptor);
					records.push(...shard.records);
				} catch (error) {
					warnings.push({ partition: descriptor.partition, shard: descriptor.shard, error: String(error) });
					this.#recordError(error);
				}
			}
		}
		return { records, warnings };
	}

	diagnostics() {
		return {
			activeGeneration: this.#activeGeneration,
			commits: this.#commits,
			dirty: this.#dirty,
			failures: this.#failures,
			lastError: this.#lastError,
			pendingActions: this.#plan ? this.#plan.actions.length - this.#plan.cursor : 0,
			pendingGeneration: this.#plan?.generation,
			writes: this.#writes
		};
	}

	#createPlan(records) {
		const root = this.#readRootOrEmpty();
		const generation = root.activeGeneration === 0 ? 1 : 0;
		const previous = root.generations[generation];
		const shards = this.#createShards(records, generation);
		const indexes = this.#createIndexes(shards, generation);
		const generations = root.generations.map(metadata => ({ ...metadata }));
		generations[generation] = { indexPages: indexes.length, shards: shards.length };
		const nextRoot = JSON.stringify({
			activeGeneration: generation,
			generations,
			storeSchemaVersion: STORE_SCHEMA_VERSION
		});
		const actions = [];
		for (let page = 0; page < previous.indexPages; page++)
			actions.push({ key: this.#indexKey(generation, page), type: "delete" });
		for (let shard = 0; shard < previous.shards; shard++)
			actions.push({ key: this.#shardKey(generation, shard), type: "delete" });
		for (const shard of shards)
			actions.push({ key: this.#shardKey(generation, shard.id), type: "set", value: shard.value });
		for (const index of indexes)
			actions.push({ key: this.#indexKey(generation, index.page), type: "set", value: index.value });
		actions.push({ key: this.#rootKey(), type: "set", value: nextRoot });
		return { actions, cursor: 0, generation };
	}

	#createShards(records, generation) {
		const partitions = new Map();
		for (const record of records) {
			const partition = this.#partitionFor(record);
			if (typeof partition !== "string" || partition.length === 0)
				throw new TypeError("Persistent record partitions must be non-empty strings");
			const entries = partitions.get(partition) ?? [];
			entries.push(record);
			partitions.set(partition, entries);
		}

		const shards = [];
		for (const [partition, entries] of [...partitions.entries()].sort(([left], [right]) => left.localeCompare(right))) {
			const sorted = [...entries].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
			let current = [];
			for (const record of sorted) {
				const candidate = [...current, record];
				if (this.#encodeShard(generation, partition, candidate).length <= this.#maxShardCharacters) {
					current = candidate;
					continue;
				}
				if (current.length === 0)
					throw new RangeError(`Persistent record in ${partition} exceeds the shard budget`);
				shards.push(this.#newShard(shards.length, generation, partition, current));
				if (this.#encodeShard(generation, partition, [record]).length > this.#maxShardCharacters)
					throw new RangeError(`Persistent record in ${partition} exceeds the shard budget`);
				current = [record];
			}
			if (current.length > 0)
				shards.push(this.#newShard(shards.length, generation, partition, current));
		}
		return shards;
	}

	#createIndexes(shards, generation) {
		const indexes = [];
		for (let offset = 0; offset < shards.length; offset += this.#maxIndexEntries) {
			const page = indexes.length;
			const entries = shards.slice(offset, offset + this.#maxIndexEntries).map(shard => ({
				checksum: shard.checksum,
				partition: shard.partition,
				shard: shard.id
			}));
			const value = JSON.stringify({ entries, generation, page, storeSchemaVersion: STORE_SCHEMA_VERSION });
			if (value.length > this.#maxShardCharacters)
				throw new RangeError(`Persistent state index page ${page} exceeds the shard budget`);
			indexes.push({ page, value });
		}
		return indexes;
	}

	#encodeShard(generation, partition, records) {
		const payload = { generation, partition, records, storeSchemaVersion: STORE_SCHEMA_VERSION };
		const serializedPayload = JSON.stringify(payload);
		return JSON.stringify({ ...payload, checksum: checksum(serializedPayload) });
	}

	#newShard(id, generation, partition, records) {
		const value = this.#encodeShard(generation, partition, records);
		return { checksum: parseJson(value, "persistent shard").checksum, id, partition, value };
	}

	#readRootOrEmpty() {
		const value = this.#storage.get(this.#rootKey());
		return value === undefined
			? { activeGeneration: 1, generations: [{ indexPages: 0, shards: 0 }, { indexPages: 0, shards: 0 }] }
			: this.#parseRoot(value);
	}

	#parseRoot(value) {
		const root = parseJson(value, "persistent state root");
		if (root?.storeSchemaVersion !== STORE_SCHEMA_VERSION)
			throw new Error("Persistent state root has an unsupported schema");
		validateGeneration(root.activeGeneration);
		if (!Array.isArray(root.generations) || root.generations.length !== 2)
			throw new Error("Persistent state root must describe both generations");
		for (const metadata of root.generations) {
			if (!Number.isInteger(metadata?.indexPages) || metadata.indexPages < 0 || !Number.isInteger(metadata?.shards) || metadata.shards < 0)
				throw new Error("Persistent state generation metadata is invalid");
		}
		return root;
	}

	#parseIndex(value, generation, page) {
		const index = parseJson(value, `persistent state index ${page}`);
		if (index?.storeSchemaVersion !== STORE_SCHEMA_VERSION || index.generation !== generation || index.page !== page || !Array.isArray(index.entries))
			throw new Error(`Persistent state index ${page} is invalid`);
		for (const entry of index.entries) {
			if (!Number.isInteger(entry?.shard) || entry.shard < 0 || typeof entry.partition !== "string" || typeof entry.checksum !== "string")
				throw new Error(`Persistent state index ${page} has an invalid shard descriptor`);
		}
		return index;
	}

	#parseShard(value, generation, descriptor) {
		const shard = parseJson(value, `persistent state shard ${descriptor.shard}`);
		const { checksum: storedChecksum, ...payload } = shard ?? {};
		if (payload.storeSchemaVersion !== STORE_SCHEMA_VERSION || payload.generation !== generation || payload.partition !== descriptor.partition || !Array.isArray(payload.records))
			throw new Error(`Persistent state shard ${descriptor.shard} is invalid`);
		const actualChecksum = checksum(JSON.stringify(payload));
		if (storedChecksum !== descriptor.checksum || storedChecksum !== actualChecksum)
			throw new Error(`Persistent state shard ${descriptor.shard} failed its checksum`);
		return payload;
	}

	#recordError(error) {
		this.#failures++;
		this.#lastError = String(error);
		this.#onError(error);
	}

	#rootKey() {
		return `${this.#keyPrefix}_root`;
	}

	#indexKey(generation, page) {
		return `${this.#keyPrefix}_g${generation}_i${page}`;
	}

	#shardKey(generation, shard) {
		return `${this.#keyPrefix}_g${generation}_s${shard}`;
	}
}
