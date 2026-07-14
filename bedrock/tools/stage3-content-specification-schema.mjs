export const STAGE3_CONTENT_SPECIFICATION_SCHEMA_VERSION = 1;

const IMPLEMENTATION_PACKAGES = new Set([
    "S3-8A",
    "S3-9",
    "S3-10",
    "S3-11",
    "S3-13",
    "S3-14",
    "S4",
    "S5",
    "S6"
]);

const ACQUISITION_CONCLUSIONS = new Set([
    "machine_or_custom_recipe_dependency",
    "no_static_acquisition_recipe",
    "vanilla_recipe_candidate",
    "world_or_loot_acquisition"
]);

const ASSET_CONCLUSIONS = new Set([
    "entity_visual_and_actor_required",
    "java_model_analysis_required",
    "persistent_block_visual_required",
    "source_item_texture_available",
    "source_model_not_found"
]);

const BEHAVIOR_REQUIREMENTS = new Set([
    "contraption_actor",
    "entity_runtime",
    "machine_runtime",
    "persistent_block_runtime",
    "special_item_component",
    "stateless_content"
]);

const REQUIRED_FIELDS = [
    "acceptanceId",
    "acquisitionConclusion",
    "assetConclusion",
    "bedrockIdentifier",
    "behaviorRequirement",
    "implementationPackage",
    "implementationReason",
    "javaIdentifier",
    "kind",
    "sourceLootPath",
    "sourceModelPaths",
    "sourceRecipePaths",
    "sourceRecipeTypes",
    "sourceTexturePaths",
    "testPlan"
];

function isNonEmptyString(value) {
    return typeof value === "string" && value.length > 0;
}

function isStringArray(value) {
    return Array.isArray(value) && value.every(isNonEmptyString);
}

export function validateStage3ContentSpecifications(specifications, workQueue) {
    if (!specifications || typeof specifications !== "object" || Array.isArray(specifications))
        throw new TypeError("Stage-3 content specifications must be an object");
    if (specifications.schemaVersion !== STAGE3_CONTENT_SPECIFICATION_SCHEMA_VERSION)
        throw new Error(`Stage-3 content specifications must use schema version ${STAGE3_CONTENT_SPECIFICATION_SCHEMA_VERSION}`);
    if (!Array.isArray(specifications.entries) || specifications.entries.length === 0)
        throw new Error("Stage-3 content specifications must contain entries");
    if (!workQueue || !Array.isArray(workQueue.entries))
        throw new TypeError("Stage-3 content specifications require a work queue");

    const queuedEntries = workQueue.entries.filter(entry => entry.deliveryPackage === "S3-8B");
    const remaining = new Map(queuedEntries.map(entry => [entry.acceptanceId, entry]));
    for (const entry of specifications.entries) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry))
            throw new Error("Stage-3 content specification entries must be objects");
        for (const field of REQUIRED_FIELDS) {
            if (field === "sourceLootPath") {
                if (entry[field] !== null && !isNonEmptyString(entry[field]))
                    throw new Error(`Content specification ${entry.acceptanceId} has invalid ${field}`);
            } else if (field.endsWith("Paths") || field === "sourceRecipeTypes") {
                if (!isStringArray(entry[field]))
                    throw new Error(`Content specification ${entry.acceptanceId} has invalid ${field}`);
            } else if (!isNonEmptyString(entry[field])) {
                throw new Error(`Content specification ${entry.acceptanceId} is missing ${field}`);
            }
        }
        if (!IMPLEMENTATION_PACKAGES.has(entry.implementationPackage))
            throw new Error(`Content specification ${entry.acceptanceId} has unknown implementation package ${entry.implementationPackage}`);
        if (!ACQUISITION_CONCLUSIONS.has(entry.acquisitionConclusion))
            throw new Error(`Content specification ${entry.acceptanceId} has unknown acquisition conclusion ${entry.acquisitionConclusion}`);
        if (!ASSET_CONCLUSIONS.has(entry.assetConclusion))
            throw new Error(`Content specification ${entry.acceptanceId} has unknown asset conclusion ${entry.assetConclusion}`);
        if (!BEHAVIOR_REQUIREMENTS.has(entry.behaviorRequirement))
            throw new Error(`Content specification ${entry.acceptanceId} has unknown behavior requirement ${entry.behaviorRequirement}`);
        const queued = remaining.get(entry.acceptanceId);
        if (!queued)
            throw new Error(`Content specification ${entry.acceptanceId} is not a unique S3-8B queue entry`);
        for (const field of ["bedrockIdentifier", "javaIdentifier", "kind"]) {
            if (entry[field] !== queued[field])
                throw new Error(`Content specification ${entry.acceptanceId} no longer matches work-queue ${field}`);
        }
        remaining.delete(entry.acceptanceId);
    }
    if (remaining.size > 0)
        throw new Error(`Stage-3 content specifications are missing ${remaining.size} S3-8B entries`);
    if (specifications.entries.length !== queuedEntries.length)
        throw new Error("Stage-3 content specifications contain duplicate S3-8B entries");

    return { entries: specifications.entries.length };
}
