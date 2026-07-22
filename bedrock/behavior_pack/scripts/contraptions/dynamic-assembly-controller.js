import { createAssemblyTransform } from "./assembly-transform.js";
import { advanceAssemblyJournal, createAssemblyJournal, DYNAMIC_ASSEMBLY_AUTHORITY_SCHEMA, normalizeDynamicAssemblyAuthorityRecord, recoveryDisposition } from "./dynamic-assembly-authority-state.js";
import { createDynamicAssemblySnapshot, materializeDynamicAssembly, normalizeDynamicAssemblySnapshot } from "./dynamic-assembly-snapshot.js";

function clone(value) {
	return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function keyFor(location) {
	return `${location.x}:${location.y}:${location.z}`;
}

function assertId(id) {
	if (typeof id !== "string" || id.length === 0 || id.length > 256)
		throw new TypeError("Dynamic assembly IDs must be short non-empty strings");
	return id;
}

function freezeReason(collision) {
	const reason = collision?.reason ?? "world_blocked";
	const location = collision?.location;
	return location && [location.x, location.y, location.z].every(Number.isInteger)
		? `${reason}:${location.x}:${location.y}:${location.z}`
		: reason;
}

/**
 * Transactional, Bedrock-independent assembly state machine. The world port
 * owns API calls; this controller owns authority, rollback, and projection
 * recovery so it can be exhaustively tested outside a game client.
 */
export class DynamicAssemblyController {
	#active = new Map();
	#claimedDestinations = new Map();
	#claimedSources = new Map();
	#world;

	constructor(worldPort) {
		for (const method of ["readBlock", "removeBlock", "placeBlock", "captureAssemblyData", "restoreAssemblyData", "spawnAssemblyProjection", "removeAssemblyProjection", "isAssemblyProjectionValid", "setAssemblyProjectionTransform", "canPlace", "findTransformCollision"]) {
			if (typeof worldPort?.[method] !== "function")
				throw new TypeError(`Dynamic assembly world port requires ${method}()`);
		}
		this.#world = worldPort;
	}

	assemble({ anchor, id, locations, owner } = {}) {
		assertId(id);
		if (this.#active.has(id))
			throw new Error(`Dynamic assembly ${id} already exists`);
		if (!Array.isArray(locations) || locations.length === 0)
			throw new TypeError("Dynamic assembly requires source locations");
		const sourceKeys = locations.map(keyFor);
		if (new Set(sourceKeys).size !== sourceKeys.length)
			throw new Error("Dynamic assembly source locations cannot repeat");
		for (const sourceKey of sourceKeys)
			if (this.#claimedSources.has(sourceKey))
				throw new Error(`Dynamic assembly source ${sourceKey} is already owned by ${this.#claimedSources.get(sourceKey)}`);

		const blocks = locations.map(location => {
			const block = this.#world.readBlock(location);
			if (!block)
				throw new Error(`Cannot assemble missing block at ${keyFor(location)}`);
			return { ...block, location: { ...location } };
		});
		const snapshot = createDynamicAssemblySnapshot({
			anchor,
			attachments: this.#world.captureAssemblyData(locations, anchor),
			blocks
		});
		const active = {
			destinationClaims: [],
			epoch: 1,
			frozenReason: undefined,
			id,
			owner: clone(owner),
			journal: advanceAssemblyJournal(advanceAssemblyJournal(createAssemblyJournal("assemble", `${id}:assemble:1`), "collected"), "snapshot_written"),
			motionKind: owner?.kind ?? "generic",
			phase: "capturing",
			projectionId: undefined,
			schemaVersion: DYNAMIC_ASSEMBLY_AUTHORITY_SCHEMA,
			snapshot,
			sourceClaims: [...sourceKeys].sort(),
			transform: createAssemblyTransform()
		};
		const removed = [];
		this.#active.set(id, active);
		for (const sourceKey of sourceKeys)
			this.#claimedSources.set(sourceKey, id);
		try {
			active.journal = advanceAssemblyJournal(active.journal, "sources_claimed");
			this.#checkpoint(active);
			for (const block of blocks)
				if (this.#world.quiesceBlock?.(block) === false)
					throw new Error(`Dynamic assembly block ${keyFor(block.location)} could not quiesce`);
			this.#world.detachAssemblyData?.(snapshot.attachments);
			active.journal = advanceAssemblyJournal(active.journal, "adapters_detached");
			active.phase = "detached";
			this.#checkpoint(active);
			for (const block of blocks) {
				this.#world.removeBlock(block.location);
				removed.push(block);
			}
			active.journal = advanceAssemblyJournal(active.journal, "blocks_removed");
			active.journal = advanceAssemblyJournal(active.journal, "authority_committed");
			active.phase = "active";
			this.#checkpoint(active);
			active.projectionId = this.#world.spawnAssemblyProjection({ epoch: active.epoch, id, owner: active.owner, snapshot, transform: active.transform });
			this.#world.setAssemblyProjectionTransform(active.projectionId, active.transform);
			active.journal = advanceAssemblyJournal(active.journal, "projection_built");
			active.journal = undefined;
			this.#checkpoint(active);
			return this.getActive(id);
		} catch (error) {
			if (active.projectionId) {
				try {
					this.#world.removeAssemblyProjection(active.projectionId);
				} catch {}
			}
			for (const block of removed.reverse())
				this.#world.placeBlock(block);
			this.#world.restoreAssemblyData(snapshot.attachments, snapshot.anchor);
			this.#active.delete(id);
			this.#releaseSources(id);
			throw error;
		}
	}

	disassemble(id) {
		const active = this.#requireActive(id);
		let blocks;
		try {
			blocks = materializeDynamicAssembly(active.snapshot, active.transform);
		} catch {
			return false;
		}
		if (blocks.some(block => !this.#world.canPlace(block.location)))
			return false;
		const destinationKeys = blocks.map(block => keyFor(block.location));
		if (destinationKeys.some(key => this.#claimedDestinations.has(key) && this.#claimedDestinations.get(key) !== id))
			return false;
		for (const key of destinationKeys)
			this.#claimedDestinations.set(key, id);
		active.destinationClaims = [...destinationKeys].sort();
		active.phase = "disassembling";
		active.journal = advanceAssemblyJournal(createAssemblyJournal("disassemble", `${id}:disassemble:${active.epoch}`), "materialized");
		active.journal = advanceAssemblyJournal(active.journal, "destinations_claimed");
		this.#checkpoint(active);
		const placed = [];
		try {
			for (const block of blocks) {
				this.#world.placeBlock(block);
				placed.push(block);
			}
			active.journal = advanceAssemblyJournal(active.journal, "blocks_placed");
			this.#world.restoreAssemblyData(active.snapshot.attachments, {
				x: active.snapshot.anchor.x + active.transform.translation.x / 4096,
				y: active.snapshot.anchor.y + active.transform.translation.y / 4096,
				z: active.snapshot.anchor.z + active.transform.translation.z / 4096
			}, active.transform, active.snapshot.anchor);
			active.journal = advanceAssemblyJournal(active.journal, "adapters_restored");
			if (blocks.some(block => this.#world.verifyBlockRestore?.(block) === false))
				throw new Error(`Dynamic assembly ${id} failed restored payload verification`);
			active.journal = advanceAssemblyJournal(active.journal, "receipts_verified");
			this.#releaseSources(id);
			active.journal = advanceAssemblyJournal(active.journal, "sources_released");
			this.#world.removeAssemblyProjection(active.projectionId);
			active.journal = advanceAssemblyJournal(active.journal, "projection_removed");
			this.#active.delete(id);
			this.#releaseDestinations(id);
			return true;
		} catch (error) {
			for (const block of placed.reverse()) {
				try {
					this.#world.removeBlock(block.location);
				} catch {}
			}
			active.phase = "frozen";
			active.frozenReason = `disassembly_rollback_required:${error}`;
			for (const source of active.sourceClaims)
				this.#claimedSources.set(source, id);
			this.#releaseDestinations(id);
			active.destinationClaims = [];
			this.#checkpoint(active);
			throw error;
		}
	}

	ensureProjection(id) {
		const active = this.#requireActive(id);
		if (active.projectionId && this.#world.isAssemblyProjectionValid(active.projectionId))
			return true;
		try {
			const epoch = active.epoch + 1;
			active.projectionId = this.#world.spawnAssemblyProjection({ epoch, id, owner: active.owner, snapshot: active.snapshot, transform: active.transform });
			this.#world.setAssemblyProjectionTransform(active.projectionId, active.transform);
			active.epoch = epoch;
			active.frozenReason = undefined;
			active.phase = "active";
			return true;
		} catch (error) {
			active.phase = "frozen";
			active.frozenReason = `projection_recovery_failed:${error}`;
			return false;
		}
	}

	getActive(id) {
		return clone(this.#requireActive(id));
	}

	restore(records) {
		if (!Array.isArray(records))
			throw new TypeError("Dynamic assembly restore requires an array");
		const pending = records.map(record => this.#normalizeRecord(record));
		const ids = new Set(this.#active.keys());
		const sources = new Set(this.#claimedSources.keys());
		for (const record of pending) {
			if (ids.has(record.id))
				throw new Error(`Dynamic assembly ${record.id} already exists`);
			ids.add(record.id);
			for (const source of this.#sourceKeys(record.snapshot)) {
				if (sources.has(source))
					throw new Error(`Dynamic assembly source ${source} is already owned`);
				sources.add(source);
			}
			for (const destination of record.destinationClaims) {
				if (this.#claimedDestinations.has(destination))
					throw new Error(`Dynamic assembly destination ${destination} is already owned`);
			}
		}
		for (const record of pending) {
			const disposition = recoveryDisposition(record);
			if (disposition.action === "discard")
				continue;
			if (disposition.action === "freeze") {
				record.phase = "frozen";
				record.frozenReason = disposition.reason;
			}
			this.#active.set(record.id, record);
			for (const source of this.#sourceKeys(record.snapshot))
				this.#claimedSources.set(source, record.id);
			for (const destination of record.destinationClaims)
				this.#claimedDestinations.set(destination, record.id);
			if (disposition.action === "restore_projection") {
				const frozenReason = record.frozenReason;
				const wasFrozen = record.phase === "frozen";
				this.ensureProjection(record.id);
				if (wasFrozen) {
					record.phase = "frozen";
					record.frozenReason = frozenReason;
				}
			}
		}
	}

	setTransform(id, transform) {
		const active = this.#requireActive(id);
		const next = createAssemblyTransform(transform);
		if (!this.ensureProjection(id))
			return false;
		const collision = this.#world.findTransformCollision(active.snapshot, active.transform, next);
		if (collision) {
			active.phase = "frozen";
			active.frozenReason = freezeReason(collision);
			return false;
		}
		this.#world.setAssemblyProjectionTransform(active.projectionId, next);
		active.epoch++;
		active.frozenReason = undefined;
		active.phase = "active";
		active.transform = next;
		return true;
	}

	/**
	 * Update one moving block's authoritative attachment payload. Actor systems
	 * use this for inventories and configuration while a contraption is away
	 * from the world; rebuilding the sealed snapshot keeps restart validation.
	 */
	updateBlockData(id, relative, updater) {
		const active = this.#requireActive(id);
		if (![relative?.x, relative?.y, relative?.z].every(Number.isInteger))
			throw new TypeError("Dynamic assembly block data updates require integer relative coordinates");
		if (typeof updater !== "function")
			throw new TypeError("Dynamic assembly block data updates require an updater");
		const target = active.snapshot.blocks.find(block => block.relative.x === relative.x && block.relative.y === relative.y && block.relative.z === relative.z);
		if (!target)
			throw new Error(`Dynamic assembly ${id} has no block at ${relative.x}:${relative.y}:${relative.z}`);
		const data = updater(clone(target.data), clone(target));
		const blocks = active.snapshot.blocks.map(block => ({
			data: block === target ? data : clone(block.data),
			location: {
				x: active.snapshot.anchor.x + block.relative.x,
				y: active.snapshot.anchor.y + block.relative.y,
				z: active.snapshot.anchor.z + block.relative.z
			},
			states: clone(block.states),
			typeId: block.typeId
		}));
		active.snapshot = createDynamicAssemblySnapshot({
			anchor: active.snapshot.anchor,
			attachments: clone(active.snapshot.attachments),
			blocks
		});
		return clone(active.snapshot.blocks.find(block => block.relative.x === relative.x && block.relative.y === relative.y && block.relative.z === relative.z)?.data);
	}

	snapshot() {
		return [...this.#active.values()]
			.map(active => ({
				destinationClaims: [...active.destinationClaims],
				epoch: active.epoch,
				...(active.frozenReason ? { frozenReason: active.frozenReason } : {}),
				id: active.id,
				...(active.journal ? { journal: clone(active.journal) } : {}),
				motionKind: active.motionKind,
				...(active.owner === undefined ? {} : { owner: clone(active.owner) }),
				phase: active.phase,
				schemaVersion: DYNAMIC_ASSEMBLY_AUTHORITY_SCHEMA,
				snapshot: active.snapshot,
				sourceClaims: [...active.sourceClaims],
				transform: active.transform
			}))
			.sort((left, right) => left.id.localeCompare(right.id));
	}

	#normalizeRecord(record) {
		const id = assertId(record?.id);
		if (record.frozenReason !== undefined && (typeof record.frozenReason !== "string" || record.frozenReason.length > 512))
			throw new TypeError(`Dynamic assembly ${id} has an invalid frozen reason`);
		const normalized = normalizeDynamicAssemblyAuthorityRecord({
			...record,
			schemaVersion: record.schemaVersion ?? 1,
			sourceClaims: record.sourceClaims ?? this.#sourceKeys(normalizeDynamicAssemblySnapshot(record.snapshot))
		});
		return {
			...normalized,
			projectionId: undefined
		};
	}

	#checkpoint(active) {
		this.#world.checkpointAssemblyAuthority?.(clone({
			destinationClaims: active.destinationClaims,
			epoch: active.epoch,
			frozenReason: active.frozenReason,
			id: active.id,
			journal: active.journal,
			motionKind: active.motionKind,
			owner: active.owner,
			phase: active.phase,
			schemaVersion: DYNAMIC_ASSEMBLY_AUTHORITY_SCHEMA,
			snapshot: active.snapshot,
			sourceClaims: active.sourceClaims,
			transform: active.transform
		}));
	}

	#releaseDestinations(id) {
		for (const [destination, owner] of this.#claimedDestinations)
			if (owner === id)
				this.#claimedDestinations.delete(destination);
	}

	#releaseSources(id) {
		for (const [source, owner] of this.#claimedSources)
			if (owner === id)
				this.#claimedSources.delete(source);
	}

	#requireActive(id) {
		assertId(id);
		const active = this.#active.get(id);
		if (!active)
			throw new Error(`Unknown dynamic assembly ${id}`);
		return active;
	}

	#sourceKeys(snapshot) {
		return snapshot.blocks.map(block => keyFor({
			x: snapshot.anchor.x + block.relative.x,
			y: snapshot.anchor.y + block.relative.y,
			z: snapshot.anchor.z + block.relative.z
		}));
	}
}
