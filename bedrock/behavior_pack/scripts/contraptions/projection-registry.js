import { MOVABLE_BLOCK_TYPES } from "./movable-blocks.js";

export const PROJECTION_REGISTRY_SCHEMA = 1;

function assertIdentifier(value, label) {
	if (typeof value !== "string" || !/^[a-z0-9._-]+:[a-z0-9._/-]+$/.test(value))
		throw new TypeError(`${label} must be a namespaced identifier`);
	return value;
}

export function defaultProjectionEntityType(blockTypeId) {
	const [namespace, path] = assertIdentifier(blockTypeId, "Projection block type").split(":");
	if (namespace !== "createbedrock")
		throw new RangeError("Only Create Bedrock blocks can use generated contraption projections");
	return `createbedrock:contraption_part_${path.replaceAll("/", "_")}`;
}

export class ProjectionRegistry {
	#entries = new Map();

	register(blockTypeId, descriptor = {}) {
		blockTypeId = assertIdentifier(blockTypeId, "Projection block type");
		if (this.#entries.has(blockTypeId))
			throw new Error(`Projection descriptor already registered for ${blockTypeId}`);
		const mode = descriptor.mode ?? "entity";
		if (!["entity", "authority_only"].includes(mode))
			throw new RangeError(`Unsupported projection mode ${mode}`);
		const normalized = {
			blockTypeId,
			mode,
			rotationMode: descriptor.rotationMode ?? "pose",
			schemaVersion: PROJECTION_REGISTRY_SCHEMA
		};
		if (mode === "entity")
			normalized.entityTypeId = assertIdentifier(descriptor.entityTypeId ?? defaultProjectionEntityType(blockTypeId), "Projection entity type");
		else if (typeof descriptor.reason !== "string" || descriptor.reason.length === 0)
			throw new TypeError("Authority-only projections require an explicit limitation reason");
		else
			normalized.reason = descriptor.reason;
		this.#entries.set(blockTypeId, normalized);
		return { ...normalized };
	}

	resolve(blockTypeId) {
		const descriptor = this.#entries.get(blockTypeId);
		return descriptor && { ...descriptor };
	}

	audit(blockTypes, { release = false } = {}) {
		const missing = [];
		const authorityOnly = [];
		for (const blockTypeId of [...blockTypes].sort()) {
			const descriptor = this.#entries.get(blockTypeId);
			if (!descriptor)
				missing.push(blockTypeId);
			else if (descriptor.mode === "authority_only")
				authorityOnly.push(blockTypeId);
		}
		return { authorityOnly, missing, ok: missing.length === 0 && (!release || authorityOnly.length === 0), release };
	}

	entityTypes() {
		return [...new Set([...this.#entries.values()].filter(entry => entry.mode === "entity").map(entry => entry.entityTypeId))].sort();
	}
}

export const dynamicAssemblyProjectionRegistry = new ProjectionRegistry();
for (const blockTypeId of MOVABLE_BLOCK_TYPES)
	dynamicAssemblyProjectionRegistry.register(blockTypeId);

export function assertReleaseProjectionCoverage(blockTypes = MOVABLE_BLOCK_TYPES) {
	const audit = dynamicAssemblyProjectionRegistry.audit(blockTypes, { release: true });
	if (!audit.ok)
		throw new Error(`Release projection coverage failed; missing=${audit.missing.join(",")}; authorityOnly=${audit.authorityOnly.join(",")}`);
	return audit;
}
