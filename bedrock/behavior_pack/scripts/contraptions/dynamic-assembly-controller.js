import { createAssemblyTransform } from "./assembly-transform.js";
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
			epoch: 1,
			frozenReason: undefined,
			id,
			owner: clone(owner),
			phase: "assembling",
			projectionId: undefined,
			snapshot,
			transform: createAssemblyTransform()
		};
		const removed = [];
		try {
			this.#world.detachAssemblyData?.(snapshot.attachments);
			for (const block of blocks) {
				this.#world.removeBlock(block.location);
				removed.push(block);
			}
			active.projectionId = this.#world.spawnAssemblyProjection({ epoch: active.epoch, id, snapshot, transform: active.transform });
			this.#world.setAssemblyProjectionTransform(active.projectionId, active.transform);
			active.phase = "active";
			this.#active.set(id, active);
			for (const sourceKey of sourceKeys)
				this.#claimedSources.set(sourceKey, id);
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
		active.phase = "disassembling";
		const placed = [];
		try {
			for (const block of blocks) {
				this.#world.placeBlock(block);
				placed.push(block);
			}
			this.#world.restoreAssemblyData(active.snapshot.attachments, {
				x: active.snapshot.anchor.x + active.transform.translation.x / 4096,
				y: active.snapshot.anchor.y + active.transform.translation.y / 4096,
				z: active.snapshot.anchor.z + active.transform.translation.z / 4096
			});
			this.#world.removeAssemblyProjection(active.projectionId);
			this.#active.delete(id);
			this.#releaseSources(id);
			return true;
		} catch (error) {
			for (const block of placed.reverse()) {
				try {
					this.#world.removeBlock(block.location);
				} catch {}
			}
			active.phase = "active";
			throw error;
		}
	}

	ensureProjection(id) {
		const active = this.#requireActive(id);
		if (active.projectionId && this.#world.isAssemblyProjectionValid(active.projectionId))
			return true;
		try {
			const epoch = active.epoch + 1;
			active.projectionId = this.#world.spawnAssemblyProjection({ epoch, id, snapshot: active.snapshot, transform: active.transform });
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
		}
		for (const record of pending) {
			this.#active.set(record.id, record);
			for (const source of this.#sourceKeys(record.snapshot))
				this.#claimedSources.set(source, record.id);
			this.ensureProjection(record.id);
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

	snapshot() {
		return [...this.#active.values()]
			.map(active => ({
				epoch: active.epoch,
				...(active.frozenReason ? { frozenReason: active.frozenReason } : {}),
				id: active.id,
				...(active.owner === undefined ? {} : { owner: clone(active.owner) }),
				phase: active.phase,
				snapshot: active.snapshot,
				transform: active.transform
			}))
			.sort((left, right) => left.id.localeCompare(right.id));
	}

	#normalizeRecord(record) {
		const id = assertId(record?.id);
		if (!["active", "frozen"].includes(record?.phase))
			throw new TypeError(`Dynamic assembly ${id} has an invalid phase`);
		if (!Number.isInteger(record.epoch) || record.epoch < 1)
			throw new TypeError(`Dynamic assembly ${id} has an invalid epoch`);
		if (record.frozenReason !== undefined && (typeof record.frozenReason !== "string" || record.frozenReason.length > 512))
			throw new TypeError(`Dynamic assembly ${id} has an invalid frozen reason`);
		return {
			epoch: record.epoch,
			frozenReason: record.frozenReason,
			id,
			owner: clone(record.owner),
			phase: record.phase,
			projectionId: undefined,
			snapshot: normalizeDynamicAssemblySnapshot(record.snapshot),
			transform: createAssemblyTransform(record.transform)
		};
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
