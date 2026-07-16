import { BlockPermutation, world } from "@minecraft/server";

import { assemblyTransformToRuntime } from "./assembly-transform.js";
import { findDynamicAssemblyCollision } from "./dynamic-assembly-collision.js";
import { captureMovingBlockData, detachMovingBlockData, restoreMovingBlockData } from "./moving-block-data.js";
import { ALL_CONTRAPTION_PART_TYPES, partTypeFor } from "./contraption-parts.js";

const CONTRAPTION_ENTITY = "createbedrock:contraption";
const GANTRY_CONTRAPTION_ENTITY = "createbedrock:gantry_contraption";
const CARRIAGE_CONTRAPTION_ENTITY = "createbedrock:carriage_contraption";
const ASSEMBLY_ANCHOR_PROPERTY = "createbedrock:dynamic_assembly_anchor";
const ASSEMBLY_ID_PROPERTY = "createbedrock:dynamic_assembly_id";
const LEGACY_ASSEMBLY_ID_PROPERTY = "createbedrock:contraption_id";
const PART_EPOCH_PROPERTY = "createbedrock:dynamic_assembly_epoch";
const PART_RELATIVE_PROPERTY = "createbedrock:dynamic_assembly_relative";

/** Bedrock API adapter for DynamicAssemblyController; no authority is stored on entities. */
export class DynamicAssemblyWorldPort {
	#dimensionId;
	#capturePhysicalBeltRuns;
	#captureSuperGlueVolumes;
	#detachPhysicalBeltRuns;
	#detachSuperGlueVolumes;
	#kineticWorld;
	#onKineticMutation;
	#restorePhysicalBeltRuns;
	#restoreSuperGlueVolumes;

	constructor(dimensionId, { capturePhysicalBeltRuns, captureSuperGlueVolumes, detachPhysicalBeltRuns, detachSuperGlueVolumes, kineticWorld, onKineticMutation, restorePhysicalBeltRuns, restoreSuperGlueVolumes } = {}) {
		if (typeof dimensionId !== "string" || dimensionId.length === 0)
			throw new TypeError("Dynamic assembly world ports require a dimension id");
		if (kineticWorld && (typeof kineticWorld.trackBrokenBlock !== "function" || typeof kineticWorld.trackPlacedBlock !== "function"))
			throw new TypeError("Dynamic assembly world ports require KineticWorld tracking methods");
		if (onKineticMutation && typeof onKineticMutation !== "function")
			throw new TypeError("Dynamic assembly kinetic mutation callbacks must be functions");
		if (![capturePhysicalBeltRuns, detachPhysicalBeltRuns, restorePhysicalBeltRuns].every(callback => callback === undefined)
			&& ![capturePhysicalBeltRuns, detachPhysicalBeltRuns, restorePhysicalBeltRuns].every(callback => typeof callback === "function"))
			throw new TypeError("Dynamic assembly physical belt callbacks must be paired functions");
		if (![captureSuperGlueVolumes, detachSuperGlueVolumes, restoreSuperGlueVolumes].every(callback => callback === undefined)
			&& ![captureSuperGlueVolumes, detachSuperGlueVolumes, restoreSuperGlueVolumes].every(callback => typeof callback === "function"))
			throw new TypeError("Dynamic assembly Super Glue callbacks must be paired functions");
		this.#dimensionId = dimensionId;
		this.#capturePhysicalBeltRuns = capturePhysicalBeltRuns;
		this.#captureSuperGlueVolumes = captureSuperGlueVolumes;
		this.#detachPhysicalBeltRuns = detachPhysicalBeltRuns;
		this.#detachSuperGlueVolumes = detachSuperGlueVolumes;
		this.#kineticWorld = kineticWorld;
		this.#onKineticMutation = onKineticMutation;
		this.#restorePhysicalBeltRuns = restorePhysicalBeltRuns;
		this.#restoreSuperGlueVolumes = restoreSuperGlueVolumes;
	}

	detachAssemblyData(attachments) {
		this.#detachPhysicalBeltRuns?.(attachments?.physicalBeltRuns);
		this.#detachSuperGlueVolumes?.(attachments?.superGlueVolumes);
	}

	readBlock(location) {
		const block = this.#dimension().getBlock(location);
		if (!block || block.typeId === "minecraft:air")
			return undefined;
		return {
			data: captureMovingBlockData(block.typeId, this.#dimensionId, location),
			states: block.permutation.getAllStates(),
			typeId: block.typeId
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

	findTransformCollision(snapshot, startTransform, endTransform) {
		return findDynamicAssemblyCollision({
			endTransform,
			readBlock: location => {
				try {
					return this.#dimension().getBlock(location) ?? { typeId: "createbedrock:unavailable_collision_space" };
				} catch {
					return { typeId: "createbedrock:unavailable_collision_space" };
				}
			},
			snapshot,
			startTransform
		});
	}

	captureAssemblyData(locations, anchor) {
		const attachments = {};
		if (this.#kineticWorld?.captureInternalBeltLinks) {
			const kineticBeltLinks = this.#kineticWorld.captureInternalBeltLinks(this.#dimensionId, locations, anchor);
			if (kineticBeltLinks.length > 0)
				attachments.kineticBeltLinks = kineticBeltLinks;
		}
		const physicalBeltRuns = this.#capturePhysicalBeltRuns?.(locations, anchor);
		if (physicalBeltRuns?.length > 0)
			attachments.physicalBeltRuns = physicalBeltRuns;
		const superGlueVolumes = this.#captureSuperGlueVolumes?.(locations, anchor);
		if (superGlueVolumes?.records?.length > 0)
			attachments.superGlueVolumes = superGlueVolumes;
		return Object.keys(attachments).length > 0 ? attachments : undefined;
	}

	restoreAssemblyData(attachments, origin, transform, assemblyAnchor = origin) {
		if (this.#kineticWorld?.restoreInternalBeltLinks && attachments?.kineticBeltLinks
			&& this.#kineticWorld.restoreInternalBeltLinks(this.#dimensionId, origin, attachments.kineticBeltLinks) > 0)
			this.#onKineticMutation?.();
		this.#restorePhysicalBeltRuns?.(attachments?.physicalBeltRuns, origin);
		this.#restoreSuperGlueVolumes?.(attachments?.superGlueVolumes, assemblyAnchor, transform);
	}

	spawnAssemblyProjection({ epoch, id, owner, snapshot, transform }) {
		const markerType = owner?.kind === "minecart_contraption"
			? CARRIAGE_CONTRAPTION_ENTITY
			: owner?.actuatorKind === "gantry" ? GANTRY_CONTRAPTION_ENTITY : CONTRAPTION_ENTITY;
		let marker = [CONTRAPTION_ENTITY, GANTRY_CONTRAPTION_ENTITY, CARRIAGE_CONTRAPTION_ENTITY].flatMap(type => this.#dimension().getEntities({ type }))
			.find(entity => entity.getDynamicProperty(ASSEMBLY_ID_PROPERTY) === id || entity.getDynamicProperty(LEGACY_ASSEMBLY_ID_PROPERTY) === id);
		const markerCreated = !marker?.isValid;
		const markerLocation = this.#markerLocation(snapshot, transform);
		if (marker?.isValid)
			marker.teleport(markerLocation);
		else {
			marker = this.#dimension().spawnEntity(markerType, markerLocation);
		}
		marker.setDynamicProperty(ASSEMBLY_ID_PROPERTY, id);
		marker.setDynamicProperty(ASSEMBLY_ANCHOR_PROPERTY, JSON.stringify(snapshot.anchor));
		this.#removeParts(id);
		const parts = [];
		try {
			for (const block of snapshot.blocks) {
				const typeId = partTypeFor(block.typeId);
				if (!typeId)
					throw new Error(`Unsupported dynamic assembly part type: ${block.typeId}`);
				const part = this.#dimension().spawnEntity(typeId, this.#partLocation(marker.location, block.relative, transform));
				part.setDynamicProperty(ASSEMBLY_ID_PROPERTY, id);
				part.setDynamicProperty(PART_EPOCH_PROPERTY, epoch);
				part.setDynamicProperty(PART_RELATIVE_PROPERTY, JSON.stringify(block.relative));
				parts.push(part);
			}
		} catch (error) {
			for (const part of parts)
				part.remove();
			if (markerCreated)
				marker.remove();
			throw error;
		}
		return marker.id;
	}

	removeAssemblyProjection(entityId) {
		const marker = world.getEntity(entityId);
		if (!marker?.isValid)
			return;
		this.#removeParts(marker.getDynamicProperty(ASSEMBLY_ID_PROPERTY) ?? marker.getDynamicProperty(LEGACY_ASSEMBLY_ID_PROPERTY));
		marker.remove();
	}

	isAssemblyProjectionValid(entityId) {
		return world.getEntity(entityId)?.isValid === true;
	}

	setAssemblyProjectionTransform(entityId, transform) {
		const marker = world.getEntity(entityId);
		if (!marker?.isValid)
			throw new Error("Dynamic assembly marker is unavailable");
		const runtime = assemblyTransformToRuntime(transform);
		const anchor = this.#readAnchor(marker);
		if (!anchor)
			throw new Error("Dynamic assembly marker is missing its authoritative anchor");
		marker.teleport(this.#markerLocation({ anchor }, transform));
		marker.setRotation({ x: 0, y: runtime.rotation });
		const id = marker.getDynamicProperty(ASSEMBLY_ID_PROPERTY);
		for (const part of this.#parts(id)) {
			const relative = this.#readRelative(part);
			if (!relative)
				continue;
			part.teleport(this.#partLocation(marker.location, relative, transform));
			part.setRotation({ x: 0, y: runtime.rotation });
		}
	}

	#dimension() {
		return world.getDimension(this.#dimensionId);
	}

	#markerLocation(snapshot, transform) {
		const runtime = assemblyTransformToRuntime(transform);
		return {
			x: snapshot.anchor.x + runtime.translation.x + 0.5,
			y: snapshot.anchor.y + runtime.translation.y + 0.5,
			z: snapshot.anchor.z + runtime.translation.z + 0.5
		};
	}

	#partLocation(markerLocation, relative, transform) {
		const runtime = assemblyTransformToRuntime(transform);
		const radians = runtime.rotation * Math.PI / 180;
		return {
			x: markerLocation.x + relative.x * Math.cos(radians) - relative.z * Math.sin(radians),
			y: markerLocation.y + relative.y,
			z: markerLocation.z + relative.x * Math.sin(radians) + relative.z * Math.cos(radians)
		};
	}

	#parts(id) {
		return ALL_CONTRAPTION_PART_TYPES.flatMap(type => this.#dimension().getEntities({ type }))
			.filter(entity => entity.getDynamicProperty(ASSEMBLY_ID_PROPERTY) === id || entity.getDynamicProperty(LEGACY_ASSEMBLY_ID_PROPERTY) === id);
	}

	#readRelative(entity) {
		const value = entity.getDynamicProperty(PART_RELATIVE_PROPERTY);
		if (typeof value !== "string")
			return undefined;
		try {
			const relative = JSON.parse(value);
			return [relative?.x, relative?.y, relative?.z].every(Number.isFinite) ? relative : undefined;
		} catch {
			return undefined;
		}
	}

	#readAnchor(entity) {
		const value = entity.getDynamicProperty(ASSEMBLY_ANCHOR_PROPERTY);
		if (typeof value !== "string")
			return undefined;
		try {
			const anchor = JSON.parse(value);
			return [anchor?.x, anchor?.y, anchor?.z].every(Number.isInteger) ? anchor : undefined;
		} catch {
			return undefined;
		}
	}

	#removeParts(id) {
		for (const part of this.#parts(id))
			part.remove();
	}

	#requireBlock(location) {
		const block = this.#dimension().getBlock(location);
		if (!block)
			throw new Error(`Dynamic assembly location is unavailable: ${location.x}:${location.y}:${location.z}`);
		return block;
	}
}
