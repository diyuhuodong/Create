const AIR_BLOCK = "minecraft:air";

export const TRAIN_COLLISION_BOX = Object.freeze({ height: 1, width: 1 });

function collisionLocation(location) {
	if (![location?.x, location?.y, location?.z].every(Number.isFinite))
		throw new TypeError("Train collision checks require finite carriage locations");
	return {
		x: Math.floor(location.x),
		y: Math.floor(location.y) + 1,
		z: Math.floor(location.z)
	};
}

export function findTrainCollision(carriages, readBlock, { ignoredEntityIds = new Set(), readEntities } = {}) {
	if (!Array.isArray(carriages) || typeof readBlock !== "function")
		throw new TypeError("Train collision checks require carriages and readBlock()");
	if (!(ignoredEntityIds instanceof Set) || readEntities !== undefined && typeof readEntities !== "function")
		throw new TypeError("Train entity collision checks require an entity reader and ignored-id set");

	for (const carriage of carriages) {
		const location = collisionLocation(carriage.location);
		const block = readBlock(location);
		if (block?.typeId && block.typeId !== AIR_BLOCK)
			return { location, reason: "world_blocked" };
		for (const entity of readEntities?.(carriage.location) ?? []) {
			if (!entity?.id || ignoredEntityIds.has(entity.id))
				continue;
			return { entityId: entity.id, location, reason: "entity_blocked" };
		}
	}
	return undefined;
}
