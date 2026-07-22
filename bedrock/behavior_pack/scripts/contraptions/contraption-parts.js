import { dynamicAssemblyProjectionRegistry } from "./projection-registry.js";

const LEGACY_CONTRAPTION_PART = "createbedrock:contraption_part";

export const CONTRAPTION_PART_TYPES = Object.freeze(Object.fromEntries([...dynamicAssemblyProjectionRegistry.entityTypes()]
	.map(entityTypeId => [entityTypeId.replace("createbedrock:contraption_part_", "createbedrock:"), entityTypeId])));

export const ALL_CONTRAPTION_PART_TYPES = [LEGACY_CONTRAPTION_PART, ...dynamicAssemblyProjectionRegistry.entityTypes()];

export function partTypeFor(blockTypeId) {
	const descriptor = dynamicAssemblyProjectionRegistry.resolve(blockTypeId);
	return descriptor?.mode === "entity" ? descriptor.entityTypeId : undefined;
}
