import { world } from "@minecraft/server";

export const BEDROCK_ESCROW_ENTITY = "createbedrock:logistics_escrow";
const INVENTORY_COMPONENT = "minecraft:inventory";
const TRANSACTION_PROPERTY = "createbedrock:transaction_id";
const DIMENSION_IDS = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];

function escrowFromEntity(entity, id) {
	if (!entity || entity.typeId !== BEDROCK_ESCROW_ENTITY)
		return undefined;
	const inventory = entity.getComponent(INVENTORY_COMPONENT);
	const container = inventory?.container;
	if (!container || container.size !== 1)
		return undefined;
	if (id !== undefined && entity.getDynamicProperty(TRANSACTION_PROPERTY) !== id)
		return undefined;
	return { container, id: entity.id };
}

export class BedrockEscrowRegistry {
	#world;

	constructor({ worldObject = world } = {}) {
		if (!worldObject || typeof worldObject.getEntity !== "function")
			throw new TypeError("Bedrock escrow registries require a world entity lookup");
		this.#world = worldObject;
	}

	create({ id, source }) {
		if (typeof id !== "string" || id.length === 0)
			throw new TypeError("Bedrock escrow transactions require identifiers");
		if (!source?.dimension || typeof source.dimension.spawnEntity !== "function" || !source.location)
			throw new TypeError("Bedrock escrow sources require a dimension and anchor location");
		const { x, y, z } = source.location;
		if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z))
			throw new TypeError("Bedrock escrow anchors must have finite coordinates");
		const entity = source.dimension.spawnEntity(BEDROCK_ESCROW_ENTITY, { x, y, z });
		entity.setDynamicProperty(TRANSACTION_PROPERTY, id);
		const escrow = escrowFromEntity(entity, id);
		if (!escrow) {
			try {
				entity.remove();
			} catch {
				// A malformed escrow entity must be reported by the caller; removal is
				// best-effort because the entity can already be invalid at this point.
			}
			throw new Error("Spawned Bedrock escrow entity has no private one-slot inventory");
		}
		return escrow;
	}

	destroy(id) {
		const entity = this.#world.getEntity(id);
		if (!entity)
			return false;
		if (entity.typeId !== BEDROCK_ESCROW_ENTITY)
			throw new Error(`Entity ${id} is not a Bedrock escrow`);
		entity.remove();
		return true;
	}

	resolve(id, transactionId) {
		if (typeof id !== "string" || id.length === 0)
			return undefined;
		return escrowFromEntity(this.#world.getEntity(id), transactionId);
	}

	sweepEmptyOrphans(activeEscrowIds) {
		if (!(activeEscrowIds instanceof Set))
			throw new TypeError("Bedrock escrow sweeps require a set of active entity identifiers");
		const retained = [];
		let removed = 0;
		for (const dimensionId of DIMENSION_IDS) {
			let entities;
			try {
				entities = this.#world.getDimension(dimensionId).getEntities({ type: BEDROCK_ESCROW_ENTITY });
			} catch {
				continue;
			}
			for (const entity of entities) {
				try {
					if (activeEscrowIds.has(entity.id))
						continue;
					const escrow = escrowFromEntity(entity);
					if (!escrow || escrow.container.getItem(0) !== undefined) {
						retained.push(entity.id);
						continue;
					}
					entity.remove();
					removed++;
				} catch {
					retained.push(entity.id);
				}
			}
		}
		return { removed, retained };
	}
}
