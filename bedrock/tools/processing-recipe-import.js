import { isSupportedProcessingItem } from "../behavior_pack/scripts/processing/processing-item-support.js";

export const RECIPE_IMPORT_STATUSES = new Set([
	"manual_specification",
	"migrated",
	"unsupported_dependency"
]);

export function mapJavaProcessingIdentifier(identifier) {
	return identifier.startsWith("create:")
		? `createbedrock:${identifier.slice("create:".length)}`
		: identifier;
}

export function supportsProcessingRecipeItems(items) {
	return items.every(isSupportedProcessingItem);
}

/**
 * Java's conditional compat recipes stay in Create's generated output even
 * when their dependency is absent.  A Bedrock base pack must not turn one of
 * those dormant recipes into a permanent "manual" migration gap.
 */
export function optionalMissingTagDependency(source, tagItems) {
	const conditions = source?.["neoforge:conditions"];
	if (!Array.isArray(conditions))
		return undefined;
	for (const condition of conditions) {
		const candidate = condition?.type === "neoforge:not" ? condition.value : undefined;
		if (candidate?.type !== "neoforge:tag_empty" || typeof candidate.tag !== "string")
			continue;
		if ((tagItems.get(candidate.tag) ?? []).length === 0)
			return candidate.tag;
	}
	return undefined;
}

export function optionalMissingModDependency(source) {
	const conditions = source?.["neoforge:conditions"];
	if (!Array.isArray(conditions))
		return undefined;
	return conditions.find(condition => condition?.type === "neoforge:mod_loaded" && typeof condition.modid === "string")?.modid;
}

export function processingImportReport(processor, records) {
	if (typeof processor !== "string" || processor.length === 0)
		throw new TypeError("Processing import reports require a processor name");
	if (!Array.isArray(records))
		throw new TypeError("Processing import reports require records");
	const normalized = records.map(record => {
		if (!record || typeof record.source !== "string" || !RECIPE_IMPORT_STATUSES.has(record.status))
			throw new TypeError("Processing import records require a source and known status");
		if (record.status === "migrated" && typeof record.recipeId !== "string")
			throw new TypeError("Migrated processing recipe records require an identifier");
		if (record.recipeIds !== undefined && (!Array.isArray(record.recipeIds) || record.recipeIds.length === 0 || record.recipeIds.some(recipeId => typeof recipeId !== "string")))
			throw new TypeError("Processing import recipe mappings require non-empty identifiers");
		if (record.status !== "migrated" && (typeof record.reason !== "string" || record.reason.length === 0))
			throw new TypeError("Unmigrated processing recipe records require a reason");
		return { ...record };
	}).sort((left, right) => left.source.localeCompare(right.source));
	const summary = Object.fromEntries([...RECIPE_IMPORT_STATUSES].map(status => [status, 0]));
	for (const record of normalized)
		summary[record.status]++;
	return {
		processor,
		schemaVersion: 1,
		summary,
		records: normalized
	};
}
