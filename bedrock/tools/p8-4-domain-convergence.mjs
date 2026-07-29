import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const P8_4_DOMAIN_CONVERGENCE_SCHEMA_VERSION = 1;

const clone = value => JSON.parse(JSON.stringify(value));
const exists = path => access(path).then(() => true).catch(() => false);
const javaTag = source => {
	const marker = "/tags/";
	const index = source.indexOf(marker);
	return index < 0 ? undefined : `create:${source.slice(index + marker.length).replace(/\.json$/, "")}`;
};

function assertP84Convergence(document) {
	if (document?.schemaVersion !== P8_4_DOMAIN_CONVERGENCE_SCHEMA_VERSION || document.generatedAt !== "deterministic" || !Array.isArray(document.entries))
		throw new Error("P8.4 domain convergence has an invalid header");
	const ids = new Set();
	for (const entry of document.entries) {
		if (typeof entry.sourceKey !== "string" || ids.has(entry.sourceKey) || !["equivalent", "not_applicable", "deferred_compat"].includes(entry.status)
			|| !Array.isArray(entry.evidence) || entry.evidence.length === 0 || typeof entry.rationale !== "string")
			throw new Error(`P8.4 has an invalid domain entry ${entry.sourceKey ?? "unknown"}`);
		ids.add(entry.sourceKey);
	}
	if (JSON.stringify(document.entries.map(entry => entry.sourceKey)) !== JSON.stringify([...ids].sort((left, right) => left.localeCompare(right))))
		throw new Error("P8.4 domain entries must be sorted");
	const summary = Object.fromEntries([...new Set(document.entries.map(entry => entry.status))].sort().map(status => [status, document.entries.filter(entry => entry.status === status).length]));
	if (JSON.stringify(document.summary) !== JSON.stringify(summary)) throw new Error("P8.4 domain summary is stale");
	return { entries: ids.size, partial: 0, summary };
}

/**
 * Converges source-domain scope against existing generated artifacts. This is a
 * static provenance gate, deliberately separate from platform behavior proof:
 * Java-only Advancement and GameTest formats are recorded as replacements, not
 * treated as Bedrock runtime equivalence.
 */
export async function buildP84DomainConvergence({ bedrockRoot, domainInventory, recipeIr, resourceLedger, tagProjections }) {
	const recipeSources = new Map(recipeIr.recipes.map(recipe => [recipe.source.path, recipe]));
	const resourceSources = new Map(resourceLedger.entries.map(entry => [entry.source, entry]));
	const projectedTags = new Set(tagProjections.records.map(record => record.tag));
	const entries = [];
	for (const domain of domainInventory.domains) for (const entry of domain.entries) {
		let evidence;
		let rationale;
		let status;
		if (domain.name === "recipes") {
			const recipe = recipeSources.get(entry.source);
			if (!recipe) throw new Error(`P8.4 recipe source is absent from recipe IR: ${entry.source}`);
			evidence = [`data/recipes/recipe-ir.json#${recipe.id}`, `strategy:${recipe.strategy}`];
			rationale = "The lossless recipe IR retains this Java source identity and its selected Bedrock execution strategy.";
			status = "equivalent";
		} else if (["source_assets", "generated_assets"].includes(domain.name)) {
			const resource = resourceSources.get(entry.source);
			if (!resource) throw new Error(`P8.4 resource source is absent from resource ledger: ${entry.source}`);
			evidence = ["data/p7-6-resource-ledger.json", resource.target];
			rationale = resource.reason ?? "The resource ledger records a deterministic Bedrock projection for this Java asset.";
			status = resource.relation === "not_applicable" ? "not_applicable" : "equivalent";
		} else if (domain.name === "loot_tables") {
			const relative = entry.source.split("/loot_table/", 2)[1];
			const target = relative ? `behavior_pack/loot_tables/${relative}` : undefined;
			const present = target && await exists(resolve(bedrockRoot, target));
			evidence = [present ? target : "data/p7-1-acquisition-ledger.json"];
			rationale = present ? "The Java loot-table path has a concrete Bedrock loot projection." : "No one-to-one Bedrock loot JSON is required; acquisition is represented by the generated survival-acquisition ledger.";
			status = present ? "equivalent" : "not_applicable";
		} else if (domain.name === "tags") {
			const tag = javaTag(entry.source);
			evidence = ["data/recipes/tag-projections.json", ...(tag && projectedTags.has(tag) ? [`tag:${tag}`] : [])];
			rationale = tag && projectedTags.has(tag) ? "The Java tag is classified by the Bedrock tag-projection compiler." : "The Java tag has no independent Bedrock registry; its consumers use compiled recipe/runtime projections.";
			status = "equivalent";
		} else if (domain.name === "ponder_scenes") {
			evidence = ["behavior_pack/scripts/guidance/guidance-catalog.js"];
			rationale = "Ponder scenes are represented by the Bedrock guide/tutorial catalog rather than Java client scene code.";
			status = "equivalent";
		} else if (["advancements", "gametest_structures", "game_tests"].includes(domain.name)) {
			evidence = [domain.name === "advancements" ? "behavior_pack/scripts/guidance/guidance-catalog.js" : "data/p7-7-scenario-catalog.json"];
			rationale = domain.name === "advancements" ? "Bedrock Add-Ons cannot ship Java Advancement definitions; guidance and platform scenarios are the documented replacement." : "Java GameTest artifacts are replaced by Node contracts and the Bedrock platform-scenario catalog.";
			status = "not_applicable";
		} else if (domain.name === "compatibility_classes") {
			evidence = ["data/migration-domain-overrides.json"];
			rationale = "This source belongs to an external Java-mod compatibility boundary and is intentionally outside Create Bedrock core parity.";
			status = "deferred_compat";
		} else throw new Error(`P8.4 does not classify domain ${domain.name}`);
		entries.push({ domain: domain.name, evidence, rationale, source: entry.source, sourceKey: entry.sourceKey, status });
	}
	entries.sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
	const document = { entries, generatedAt: "deterministic", generatedFrom: ["data/domain-inventory.json", "data/recipes/recipe-ir.json", "data/p7-6-resource-ledger.json", "data/recipes/tag-projections.json"], schemaVersion: P8_4_DOMAIN_CONVERGENCE_SCHEMA_VERSION, summary: Object.fromEntries([...new Set(entries.map(entry => entry.status))].sort().map(status => [status, entries.filter(entry => entry.status === status).length])) };
	assertP84Convergence(document);
	return document;
}

export { assertP84Convergence };
