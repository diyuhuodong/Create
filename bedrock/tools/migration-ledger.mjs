import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
	MIGRATION_LEDGER_SCHEMA_VERSION,
	validateMigrationLedger,
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

export async function buildMigrationLedger({ bedrockRoot, catalog, domainInventory, matrix, overrides = { schemaVersion: 1, entries: [] } }) {
	if (!bedrockRoot || !catalog || !domainInventory || !matrix)
		throw new TypeError("Migration ledger requires Bedrock root, catalog, domain inventory, and matrix");
	validateMigrationOverrides(overrides, catalog);
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
		generatedFrom: "bedrock/data/java-registration-catalog.json, migration-matrix.json, domain-inventory.json, and migration-overrides.json",
		registrationEntries: catalog.entries.map(entry => ({
			acquisition: "unreviewed",
			behavior: "unreviewed",
			candidateTargets: candidateTargets(entry, definitions),
			family: "unclassified",
			javaIdentifier: entry.javaIdentifier,
			kind: entry.kind,
			legacyMatrix: legacyEntry(matrix, entry) ?? null,
			mapping: { relation: "unmapped", targets: [] },
			resources: "unreviewed",
			sourceKey: entry.sourceKey,
			status: "unclassified",
			...overridesBySourceKey.get(entry.sourceKey)
		})),
		schemaVersion: MIGRATION_LEDGER_SCHEMA_VERSION
	};
	validateMigrationLedger(ledger, catalog, domainInventory);
	return { definitions, ledger };
}
