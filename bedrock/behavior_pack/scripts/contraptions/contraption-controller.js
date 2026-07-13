import { createContraptionSnapshot, materializeSnapshot, normalizeContraptionSnapshot, rotateSnapshotY } from "./contraption-snapshot.js";

export class ContraptionController {
	#active = new Map();
	#world;

	constructor(worldPort) {
		for (const method of ["readBlock", "removeBlock", "placeBlock", "captureAssemblyData", "restoreAssemblyData", "spawnContraption", "removeContraption", "isContraptionValid", "setContraptionRotation", "canPlace", "findRotationCollision"]) {
			if (typeof worldPort?.[method] !== "function")
				throw new TypeError(`Contraption world port requires ${method}()`);
		}
		this.#world = worldPort;
	}

	assemble({ id, anchor, locations, maxBlocks }) {
		if (!id || this.#active.has(id))
			throw new Error("Contraption ids must be unique");
		if (!Array.isArray(locations) || locations.length === 0)
			throw new TypeError("Contraption assembly requires source locations");

		const blocks = locations.map(location => {
			const block = this.#world.readBlock(location);
			if (!block)
				throw new Error(`Cannot assemble missing block at ${location.x}:${location.y}:${location.z}`);
			return { ...block, location: { ...location } };
		});
		const attachments = this.#world.captureAssemblyData(locations, anchor);
		const snapshot = createContraptionSnapshot({ anchor, attachments, blocks, maxBlocks });
		const removed = [];

		try {
			for (const block of blocks) {
				this.#world.removeBlock(block.location);
				removed.push(block);
			}
			const entityId = this.#world.spawnContraption({ id, snapshot, origin: anchor });
			this.#active.set(id, { entityId, origin: { ...anchor }, rotation: 0, snapshot });
			return { entityId, snapshot };
		} catch (error) {
			for (const block of removed)
				this.#world.placeBlock(block);
			this.#world.restoreAssemblyData(snapshot.attachments, anchor);
			throw error;
		}
	}

	disassemble(id, origin, quarterTurns = 0) {
		const active = this.#active.get(id);
		if (!active)
			throw new Error(`Unknown contraption ${id}`);
		if (!Number.isInteger(quarterTurns))
			throw new TypeError("Contraption restoration rotation must be expressed in quarter turns");

		const rotatedSnapshot = rotateSnapshotY(active.snapshot, quarterTurns);
		const blocks = materializeSnapshot(rotatedSnapshot, origin);
		if (blocks.some(block => !this.#world.canPlace(block.location)))
			return false;

		const placed = [];
		try {
			for (const block of blocks) {
				this.#world.placeBlock(block);
				placed.push(block);
			}
			this.#world.restoreAssemblyData(rotatedSnapshot.attachments, origin);
			this.#world.removeContraption(active.entityId);
			this.#active.delete(id);
			return true;
		} catch (error) {
			for (const block of placed.reverse()) {
				try {
					this.#world.removeBlock(block.location);
				} catch (rollbackError) {
					console.warn(`[Create Bedrock] Contraption rollback failed at ${block.location.x}:${block.location.y}:${block.location.z}: ${rollbackError}`);
				}
			}
			throw error;
		}
	}

	getActive(id) {
		return this.#active.get(id);
	}

	ensureEntity(id) {
		const active = this.#active.get(id);
		if (!active)
			throw new Error(`Unknown contraption ${id}`);
		if (this.#world.isContraptionValid(active.entityId))
			return true;

		try {
			active.entityId = this.#world.spawnContraption({
				id,
				origin: active.origin,
				snapshot: active.snapshot
			});
			this.#world.setContraptionRotation(active.entityId, active.rotation);
			active.recoveryError = undefined;
			return true;
		} catch (error) {
			active.recoveryError = String(error);
			return false;
		}
	}

	setRotation(id, rotation) {
		if (!Number.isFinite(rotation))
			throw new TypeError("Contraption rotation must be finite");
		const active = this.#active.get(id);
		if (!active)
			throw new Error(`Unknown contraption ${id}`);

		const collision = this.#world.findRotationCollision(active.snapshot, active.origin, active.rotation, rotation);
		if (collision) {
			active.blockedReason = `${collision.reason ?? "world_blocked"}:${collision.location.x}:${collision.location.y}:${collision.location.z}`;
			return false;
		}
		active.rotation = rotation;
		active.blockedReason = undefined;
		this.#world.setContraptionRotation(active.entityId, rotation);
		return true;
	}

	snapshot() {
		return [...this.#active.entries()].map(([id, active]) => ({
			id,
			origin: { ...active.origin },
			rotation: active.rotation,
			snapshot: active.snapshot
		}));
	}

	restore(records) {
		if (!Array.isArray(records))
			throw new TypeError("Contraption controller records must be an array");

		const ids = new Set(this.#active.keys());
		const pending = records.map(record => this.#normalizeRestoreRecord(record, ids));
		const restored = [];
		try {
			for (const record of pending) {
				const entityId = this.#world.spawnContraption({
					id: record.id,
					origin: record.origin,
					snapshot: record.snapshot
				});
				const active = { entityId, origin: record.origin, rotation: record.rotation, snapshot: record.snapshot };
				this.#active.set(record.id, active);
				try {
					this.#world.setContraptionRotation(entityId, record.rotation);
				} catch (error) {
					this.#active.delete(record.id);
					this.#world.removeContraption(entityId);
					throw error;
				}
				restored.push({ entityId, id: record.id });
			}
		} catch (error) {
			for (const record of restored.reverse()) {
				this.#active.delete(record.id);
				try {
					this.#world.removeContraption(record.entityId);
				} catch (rollbackError) {
					console.warn(`[Create Bedrock] Contraption restore rollback failed for ${record.id}: ${rollbackError}`);
				}
			}
			throw error;
		}
	}

	#normalizeRestoreRecord(record, ids) {
		if (!record?.id || ids.has(record.id) || !record.snapshot || !record.origin)
			throw new TypeError("Invalid contraption controller record");
		if (![record.origin.x, record.origin.y, record.origin.z].every(Number.isInteger))
			throw new TypeError(`Invalid contraption origin for ${record.id}`);
		const rotation = record.rotation ?? 0;
		if (!Number.isFinite(rotation))
			throw new TypeError(`Invalid contraption rotation for ${record.id}`);
		ids.add(record.id);
		return {
			id: record.id,
			origin: { ...record.origin },
			rotation,
			snapshot: normalizeContraptionSnapshot(record.snapshot)
		};
	}
}
