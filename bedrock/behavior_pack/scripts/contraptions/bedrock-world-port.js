import { BlockPermutation, world } from "@minecraft/server";

const CONTRAPTION_ENTITY = "createbedrock:contraption";
const CONTRAPTION_PART_ENTITY = "createbedrock:contraption_part";
const CONTRAPTION_PART_TYPES = {
	"createbedrock:shaft": "createbedrock:contraption_part_shaft",
	"createbedrock:cogwheel": "createbedrock:contraption_part_cogwheel"
};
const ALL_CONTRAPTION_PART_TYPES = [CONTRAPTION_PART_ENTITY, ...new Set(Object.values(CONTRAPTION_PART_TYPES))];
const CONTRAPTION_ID_PROPERTY = "createbedrock:contraption_id";
const CONTRAPTION_PART_RELATIVE_PROPERTY = "createbedrock:contraption_part_relative";

export class BedrockContraptionWorldPort {
	#dimensionId;
	#kineticWorld;
	#onKineticMutation;

	constructor(dimensionId, { kineticWorld, onKineticMutation } = {}) {
		if (typeof dimensionId !== "string" || dimensionId.length === 0)
			throw new TypeError("Contraption world ports require a dimension id");
		if (kineticWorld && (typeof kineticWorld.trackBrokenBlock !== "function" || typeof kineticWorld.trackPlacedBlock !== "function"))
			throw new TypeError("Kinetic contraption ports require KineticWorld tracking methods");
		if (onKineticMutation && typeof onKineticMutation !== "function")
			throw new TypeError("Kinetic contraption mutation callback must be a function");
		this.#dimensionId = dimensionId;
		this.#kineticWorld = kineticWorld;
		this.#onKineticMutation = onKineticMutation;
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
		if (this.#kineticWorld?.trackBrokenBlock(this.#dimensionId, location))
			this.#onKineticMutation?.();
	}

	placeBlock(blockData) {
		const block = this.#requireBlock(blockData.location);
		block.setPermutation(BlockPermutation.resolve(blockData.typeId, blockData.states));
		if (this.#kineticWorld?.trackPlacedBlock(block))
			this.#onKineticMutation?.();
	}

	canPlace(location) {
		const block = this.#dimension().getBlock(location);
		return !!block && block.typeId === "minecraft:air";
	}

	spawnContraption({ id, origin, snapshot }) {
		let marker = this.#dimension().getEntities({ type: CONTRAPTION_ENTITY })
			.find(entity => entity.getDynamicProperty(CONTRAPTION_ID_PROPERTY) === id);
		if (marker?.isValid) {
			marker.teleport(origin);
		} else {
			marker = this.#dimension().spawnEntity(CONTRAPTION_ENTITY, origin);
			marker.setDynamicProperty(CONTRAPTION_ID_PROPERTY, id);
		}

		this.#removeParts(id);
		for (const block of snapshot.blocks) {
			const partType = CONTRAPTION_PART_TYPES[block.typeId];
			if (!partType)
				throw new Error(`Unsupported contraption part type: ${block.typeId}`);
			const part = this.#dimension().spawnEntity(partType, this.#partLocation(origin, block.relative, 0));
			part.setDynamicProperty(CONTRAPTION_ID_PROPERTY, id);
			part.setDynamicProperty(CONTRAPTION_PART_RELATIVE_PROPERTY, JSON.stringify(block.relative));
		}
		return marker.id;
	}

	removeContraption(entityId) {
		const entity = world.getEntity(entityId);
		if (entity?.isValid) {
			this.#removeParts(entity.getDynamicProperty(CONTRAPTION_ID_PROPERTY));
			entity.remove();
		}
	}

	setContraptionRotation(entityId, rotation) {
		const entity = world.getEntity(entityId);
		if (entity?.isValid) {
			entity.setRotation({ x: 0, y: rotation });
			const id = entity.getDynamicProperty(CONTRAPTION_ID_PROPERTY);
			for (const part of this.#parts(id)) {
				const relative = this.#readRelative(part);
				if (!relative)
					continue;
				part.teleport(this.#partLocation(entity.location, relative, rotation));
				part.setRotation({ x: 0, y: rotation });
			}
		}
	}

	#parts(id) {
		return ALL_CONTRAPTION_PART_TYPES.flatMap(type => this.#dimension().getEntities({ type }))
			.filter(entity => entity.getDynamicProperty(CONTRAPTION_ID_PROPERTY) === id);
	}

	#removeParts(id) {
		for (const part of this.#parts(id))
			part.remove();
	}

	#readRelative(entity) {
		const value = entity.getDynamicProperty(CONTRAPTION_PART_RELATIVE_PROPERTY);
		if (typeof value !== "string")
			return undefined;
		try {
			const relative = JSON.parse(value);
			return Number.isFinite(relative?.x) && Number.isFinite(relative?.y) && Number.isFinite(relative?.z)
				? relative
				: undefined;
		} catch {
			return undefined;
		}
	}

	#partLocation(origin, relative, rotation) {
		const radians = rotation * Math.PI / 180;
		return {
			x: origin.x + relative.x * Math.cos(radians) - relative.z * Math.sin(radians) + 0.5,
			y: origin.y + relative.y + 0.5,
			z: origin.z + relative.x * Math.sin(radians) + relative.z * Math.cos(radians) + 0.5
		};
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
