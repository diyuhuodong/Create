import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
	MIGRATION_LEDGER_SCHEMA_VERSION,
	validateMigrationLedger,
	validateMigrationDomainOverrides,
	validateMigrationOverrides
} from "./migration-ledger-schema.mjs";

async function filesUnder(directory) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const file = resolve(directory, entry.name);
		if (entry.isDirectory())
			files.push(...await filesUnder(file));
		else if (entry.name.endsWith(".json"))
			files.push(file);
	}
	return files;
}

async function bedrockIdentifiers(directory, rootKey) {
	const identifiers = new Set();
	for (const file of await filesUnder(directory)) {
		const document = JSON.parse(await readFile(file, "utf8"));
		const identifier = document[rootKey]?.description?.identifier;
		if (typeof identifier === "string")
			identifiers.add(identifier);
	}
	return identifiers;
}

function legacyEntry(matrix, catalogEntry) {
	const entry = matrix.entries.find(candidate => candidate.javaIdentifier === catalogEntry.javaIdentifier && candidate.kind === catalogEntry.kind);
	return entry && {
		acceptanceId: entry.acceptanceId,
		resourceStatus: entry.resourceStatus,
		status: entry.status
	};
}

function candidateTargets(entry, definitions) {
	const identifier = entry.javaIdentifier.replace(/^create:/, "createbedrock:");
	const definitionKind = entry.kind === "block_entity" ? "block" : entry.kind;
	return definitions[definitionKind]?.has(identifier) ? [identifier] : [];
}

function domainLedgerEntries(domainInventory, domainOverrides, domainConvergence) {
	const rules = new Map(domainOverrides.rules.map(rule => [rule.domain, rule]));
	const conclusions = new Map(domainConvergence.entries.map(entry => [entry.sourceKey, entry]));
	return domainInventory.domains
		.flatMap(domain => domain.entries.map(entry => {
			const rule = rules.get(domain.name);
			const conclusion = conclusions.get(entry.sourceKey);
			if (!conclusion || conclusion.domain !== domain.name || conclusion.source !== entry.source)
				throw new Error(`Migration ledger domain ${entry.sourceKey} is missing its P8.4 conclusion`);
			return {
				convergence: { evidence: conclusion.evidence, package: "P8.4" },
				domain: domain.name,
				family: rule.family,
				owner: rule.owner,
				registrationSourceKeys: [],
				rationale: conclusion.rationale,
				source: entry.source,
				sourceKey: entry.sourceKey,
				status: conclusion.status,
				strategy: rule.strategy,
				...(entry.test ? { test: entry.test } : {}),
				...(entry.type ? { type: entry.type } : {})
			};
		}))
		.sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
}

function r1Family(entry) {
	if (entry.kind === "fluid")
		return "P7.3/fluid_heat";
	if (entry.kind === "entity")
		return "P7.5/dynamic_and_trains";
	if (entry.kind === "block_entity")
		return "P7.4/system_semantics";
	return "P7.1/content_and_acquisition";
}

function r1FluidTargets(entry) {
	return {
		"create:chocolate": ["createbedrock:chocolate"],
		"create:honey": ["createbedrock:honey"],
		"create:potion": ["minecraft:potion"],
		"create:tea": ["createbedrock:builders_tea"]
	}[entry.javaIdentifier] ?? [];
}

// Java block entities are attached to these valid blocks in AllBlockEntityTypes.
// Bedrock represents that persistent state through script components on the
// block definitions, so the relation is virtualized rather than one-to-one.
function virtualBlockEntityTargets(entry) {
	return {
		"create:blaze_heater": ["createbedrock:blaze_burner"],
		"create:bogey": ["createbedrock:small_bogey", "createbedrock:large_bogey"],
		"create:chassis": ["createbedrock:linear_chassis", "createbedrock:radial_chassis", "createbedrock:secondary_linear_chassis"],
		"create:copycat": ["createbedrock:copycat_base", "createbedrock:copycat_panel", "createbedrock:copycat_step", "createbedrock:copycat_bars"],
		"create:cursed_bell": ["createbedrock:haunted_bell"],
		"create:drill": ["createbedrock:mechanical_drill"],
		"create:encased_cogwheel": ["createbedrock:andesite_encased_cogwheel", "createbedrock:brass_encased_cogwheel"],
		"create:encased_large_cogwheel": ["createbedrock:andesite_encased_large_cogwheel", "createbedrock:brass_encased_large_cogwheel"],
		"create:encased_shaft": ["createbedrock:andesite_encased_shaft", "createbedrock:brass_encased_shaft", "createbedrock:encased_chain_drive", "createbedrock:metal_girder_encased_shaft"],
		"create:factory_panel": ["createbedrock:factory_gauge"],
		"create:flap_display": ["createbedrock:display_board"],
		"create:funnel": ["createbedrock:andesite_funnel", "createbedrock:brass_funnel"],
		"create:gantry_pinion": ["createbedrock:gantry_carriage"],
		"create:harvester": ["createbedrock:mechanical_harvester"],
		"create:motor": ["createbedrock:creative_motor"],
		"create:saw": ["createbedrock:mechanical_saw"],
		"create:simple_kinetic": ["createbedrock:shaft", "createbedrock:cogwheel", "createbedrock:large_cogwheel"],
		"create:sliding_door": ["createbedrock:andesite_door", "createbedrock:brass_door", "createbedrock:copper_door", "createbedrock:framed_glass_door", "createbedrock:train_door"],
		"create:table_cloth": ["createbedrock:andesite_table_cloth", "createbedrock:brass_table_cloth", "createbedrock:copper_table_cloth"],
		"create:valve_handle": ["createbedrock:copper_valve_handle"]
	}[entry.javaIdentifier] ?? [];
}

/** R1's conservative baseline: a definition proves a projection exists, never full parity. */
function r1RegistrationClassification(entry, definitions) {
	const candidates = candidateTargets(entry, definitions);
	const targets = entry.kind === "fluid"
		? r1FluidTargets(entry)
		: entry.kind === "block_entity" ? [...new Set([...candidates, ...virtualBlockEntityTargets(entry)])] : candidates;
	const mapped = targets.length > 0;
	return {
		acquisition: mapped ? "partial" : "missing",
		behavior: mapped ? "partial" : "missing",
		family: r1Family(entry),
		mapping: mapped
			? { relation: entry.kind === "block_entity" || entry.kind === "fluid" ? "virtualized" : "one_to_one", targets }
			: { relation: "unmapped", targets: [] },
		resources: mapped ? "partial" : "missing",
		status: mapped ? "partial" : "missing"
	};
}

export async function buildMigrationLedger({ bedrockRoot, catalog, domainInventory, matrix, overrides = { schemaVersion: 1, entries: [] }, domainOverrides, domainConvergence }) {
	if (!bedrockRoot || !catalog || !domainInventory || !matrix || !domainConvergence)
		throw new TypeError("Migration ledger requires Bedrock root, catalog, domain inventory, matrix, and P8.4 domain convergence");
	validateMigrationOverrides(overrides, catalog);
	validateMigrationDomainOverrides(domainOverrides, domainInventory);
	if (!Array.isArray(domainConvergence.entries) || domainConvergence.entries.length !== domainInventory.domains.reduce((total, domain) => total + domain.entries.length, 0))
		throw new Error("Migration ledger requires complete P8.4 domain convergence");
	const overridesBySourceKey = new Map(overrides.entries.map(entry => [entry.sourceKey, entry]));
	const behaviorRoot = resolve(bedrockRoot, "behavior_pack");
	const definitions = {
		block: await bedrockIdentifiers(resolve(behaviorRoot, "blocks"), "minecraft:block"),
		entity: await bedrockIdentifiers(resolve(behaviorRoot, "entities"), "minecraft:entity"),
		item: await bedrockIdentifiers(resolve(behaviorRoot, "items"), "minecraft:item")
	};
	const totalDomains = domainInventory.domains.reduce((total, domain) => total + domain.entries.length, 0);
	const ledger = {
		domainInventory: {
			path: "bedrock/data/domain-inventory.json",
			summary: domainInventory.summary,
			total: totalDomains
		},
		generatedAt: "deterministic",
			generatedFrom: "bedrock/data/java-registration-catalog.json, migration-matrix.json, domain-inventory.json, migration-overrides.json, migration-domain-overrides.json, and p8-4-domain-convergence.json",
			domainEntries: domainLedgerEntries(domainInventory, domainOverrides, domainConvergence),
		registrationEntries: catalog.entries.map(entry => ({
			...r1RegistrationClassification(entry, definitions),
			candidateTargets: candidateTargets(entry, definitions),
			javaIdentifier: entry.javaIdentifier,
			kind: entry.kind,
			legacyMatrix: legacyEntry(matrix, entry) ?? null,
			sourceKey: entry.sourceKey,
			...overridesBySourceKey.get(entry.sourceKey)
		})),
		schemaVersion: MIGRATION_LEDGER_SCHEMA_VERSION
	};
	validateMigrationLedger(ledger, catalog, domainInventory);
	return { definitions, ledger };
}
