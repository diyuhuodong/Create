import { createContraptionSnapshot, materializeSnapshot, normalizeContraptionSnapshot, rotateSnapshotY } from "./contraption-snapshot.js";

export class ContraptionController {
	#active = new Map();
	#world;

	constructor(worldPort) {
		for (const method of ["readBlock", "removeBlock", "placeBlock", "captureAssemblyData", "restoreAssemblyData", "spawnContraption", "removeContraption", "isContraptionValid", "setContraptionRotation", "canPlace"]) {
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
			return true;
		} catch {
			return false;
		}
	}

	setRotation(id, rotation) {
		if (!Number.isFinite(rotation))
			throw new TypeError("Contraption rotation must be finite");
		const active = this.#active.get(id);
		if (!active)
			throw new Error(`Unknown contraption ${id}`);

		active.rotation = rotation;
		this.#world.setContraptionRotation(active.entityId, rotation);
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

		for (const record of records) {
			if (!record?.id || this.#active.has(record.id) || !record.snapshot || !record.origin)
				throw new TypeError("Invalid contraption controller record");
			const snapshot = normalizeContraptionSnapshot(record.snapshot);

			const entityId = this.#world.spawnContraption({
				id: record.id,
				origin: record.origin,
				snapshot
			});
			const rotation = record.rotation ?? 0;
			this.#active.set(record.id, {
				entityId,
				origin: { ...record.origin },
				rotation,
				snapshot
			});
			this.#world.setContraptionRotation(entityId, rotation);
		}
	}
}
