import { BlockPermutation, world } from "@minecraft/server";

import { captureMovingBlockData, detachMovingBlockData, restoreMovingBlockData } from "./moving-block-data.js";
import { ALL_CONTRAPTION_PART_TYPES, partTypeFor } from "./contraption-parts.js";
import { findContraptionCollision } from "./contraption-collision.js";

const CONTRAPTION_ENTITY = "createbedrock:contraption";
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
			data: captureMovingBlockData(block.typeId, this.#dimensionId, location),
			typeId: block.typeId,
			states: block.permutation.getAllStates()
		};
	}

	removeBlock(location) {
		const block = this.#requireBlock(location);
		detachMovingBlockData(block.typeId, this.#dimensionId, location);
		block.setType("minecraft:air");
		if (this.#kineticWorld?.trackBrokenBlock(this.#dimensionId, location))
			this.#onKineticMutation?.();
	}

	placeBlock(blockData) {
		const block = this.#requireBlock(blockData.location);
		block.setPermutation(BlockPermutation.resolve(blockData.typeId, blockData.states));
		restoreMovingBlockData(blockData.typeId, this.#dimensionId, blockData.location, blockData.data);
		if (this.#kineticWorld?.trackPlacedBlock(block))
			this.#onKineticMutation?.();
	}

	canPlace(location) {
		const block = this.#dimension().getBlock(location);
		return !!block && block.typeId === "minecraft:air";
	}

	findRotationCollision(snapshot, origin, startRotation, endRotation) {
		return findContraptionCollision({
			snapshot,
			origin,
			startRotation,
			endRotation,
			readBlock: location => {
				try {
					return this.#dimension().getBlock(location) ?? { typeId: "createbedrock:unavailable_collision_space" };
				} catch {
					return { typeId: "createbedrock:unavailable_collision_space" };
				}
			}
		});
	}

	captureAssemblyData(locations, anchor) {
		if (!this.#kineticWorld?.captureInternalBeltLinks)
			return undefined;
		const kineticBeltLinks = this.#kineticWorld.captureInternalBeltLinks(this.#dimensionId, locations, anchor);
		return kineticBeltLinks.length > 0 ? { kineticBeltLinks } : undefined;
	}

	restoreAssemblyData(attachments, origin) {
		if (!this.#kineticWorld?.restoreInternalBeltLinks || !attachments?.kineticBeltLinks)
			return;
		if (this.#kineticWorld.restoreInternalBeltLinks(this.#dimensionId, origin, attachments.kineticBeltLinks) > 0)
			this.#onKineticMutation?.();
	}

	spawnContraption({ id, origin, snapshot }) {
		let marker = this.#dimension().getEntities({ type: CONTRAPTION_ENTITY })
			.find(entity => entity.getDynamicProperty(CONTRAPTION_ID_PROPERTY) === id);
		const createdMarker = !marker?.isValid;
		if (marker?.isValid) {
			marker.teleport(origin);
		} else {
			marker = this.#dimension().spawnEntity(CONTRAPTION_ENTITY, origin);
			marker.setDynamicProperty(CONTRAPTION_ID_PROPERTY, id);
		}

		this.#removeParts(id);
		const createdParts = [];
		try {
			for (const block of snapshot.blocks) {
				const partType = partTypeFor(block.typeId);
				if (!partType)
					throw new Error(`Unsupported contraption part type: ${block.typeId}`);
				const part = this.#dimension().spawnEntity(partType, this.#partLocation(origin, block.relative, 0));
				part.setDynamicProperty(CONTRAPTION_ID_PROPERTY, id);
				part.setDynamicProperty(CONTRAPTION_PART_RELATIVE_PROPERTY, JSON.stringify(block.relative));
				createdParts.push(part);
			}
		} catch (error) {
			for (const part of createdParts)
				part.remove();
			if (createdMarker)
				marker.remove();
			throw error;
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

	isContraptionValid(entityId) {
		return world.getEntity(entityId)?.isValid === true;
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
