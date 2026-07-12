import { BlockPermutation, world } from "@minecraft/server";

const CONTRAPTION_ENTITY = "createbedrock:contraption";
const CONTRAPTION_ID_PROPERTY = "createbedrock:contraption_id";

export class BedrockContraptionWorldPort {
	#dimensionId;

	constructor(dimensionId) {
		if (typeof dimensionId !== "string" || dimensionId.length === 0)
			throw new TypeError("Contraption world ports require a dimension id");
		this.#dimensionId = dimensionId;
	}

	readBlock(location) {
		const block = this.#dimension().getBlock(location);
		if (!block || block.typeId === "minecraft:air")
			return undefined;

		return {
			typeId: block.typeId,
			states: block.permutation.getAllStates()
		};
	}

	removeBlock(location) {
		const block = this.#requireBlock(location);
		block.setType("minecraft:air");
	}

	placeBlock(blockData) {
		const block = this.#requireBlock(blockData.location);
		block.setPermutation(BlockPermutation.resolve(blockData.typeId, blockData.states));
	}

	canPlace(location) {
		const block = this.#dimension().getBlock(location);
		return !!block && block.typeId === "minecraft:air";
	}

	spawnContraption({ id, origin }) {
		const existing = this.#dimension().getEntities({ type: CONTRAPTION_ENTITY })
			.find(entity => entity.getDynamicProperty(CONTRAPTION_ID_PROPERTY) === id);
		if (existing?.isValid) {
			existing.teleport(origin);
			return existing.id;
		}

		const entity = this.#dimension().spawnEntity(CONTRAPTION_ENTITY, origin);
		entity.setDynamicProperty(CONTRAPTION_ID_PROPERTY, id);
		return entity.id;
	}

	removeContraption(entityId) {
		const entity = world.getEntity(entityId);
		if (entity?.isValid)
			entity.remove();
	}

	setContraptionRotation(entityId, rotation) {
		const entity = world.getEntity(entityId);
		if (entity?.isValid)
			entity.setRotation({ x: 0, y: rotation });
	}

	#dimension() {
		return world.getDimension(this.#dimensionId);
	}

	#requireBlock(location) {
		const block = this.#dimension().getBlock(location);
		if (!block)
			throw new Error(`Contraption location is unavailable: ${location.x}:${location.y}:${location.z}`);
		return block;
	}
}
