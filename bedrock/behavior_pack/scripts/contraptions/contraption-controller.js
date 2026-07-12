import { createContraptionSnapshot, materializeSnapshot } from "./contraption-snapshot.js";

export class ContraptionController {
	#active = new Map();
	#world;

	constructor(worldPort) {
		for (const method of ["readBlock", "removeBlock", "placeBlock", "spawnContraption", "removeContraption", "setContraptionRotation", "canPlace"]) {
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
		const snapshot = createContraptionSnapshot({ anchor, blocks, maxBlocks });
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
			throw error;
		}
	}

	disassemble(id, origin) {
		const active = this.#active.get(id);
		if (!active)
			throw new Error(`Unknown contraption ${id}`);

		const blocks = materializeSnapshot(active.snapshot, origin);
		if (blocks.some(block => !this.#world.canPlace(block.location)))
			return false;

		for (const block of blocks)
			this.#world.placeBlock(block);
		this.#world.removeContraption(active.entityId);
		this.#active.delete(id);
		return true;
	}

	getActive(id) {
		return this.#active.get(id);
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

			const entityId = this.#world.spawnContraption({
				id: record.id,
				origin: record.origin,
				snapshot: record.snapshot
			});
			const rotation = record.rotation ?? 0;
			this.#active.set(record.id, {
				entityId,
				origin: { ...record.origin },
				rotation,
				snapshot: record.snapshot
			});
			this.#world.setContraptionRotation(entityId, rotation);
		}
	}
}
