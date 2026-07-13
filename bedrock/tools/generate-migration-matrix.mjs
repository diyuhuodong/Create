import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { classifyRegistration } from "./migration-classification.mjs";
import { MATRIX_SCHEMA_VERSION } from "./migration-matrix-schema.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(bedrockRoot, "..");

const catalogs = [
	{
		kind: "block",
		source: "src/main/java/com/simibubi/create/AllBlocks.java",
		pattern: /\.block\("([a-z0-9_]+)"/g
	},
	{
		kind: "item",
		source: "src/main/java/com/simibubi/create/AllItems.java",
		pattern: /\.item\("([a-z0-9_]+)"/g
	},
	{
		kind: "block_entity",
		source: "src/main/java/com/simibubi/create/AllBlockEntityTypes.java",
		pattern: /\.blockEntity\("([a-z0-9_]+)"/g
	},
	{
		kind: "entity",
		source: "src/main/java/com/simibubi/create/AllEntityTypes.java",
		pattern: /\b(?:contraption|register)\("([a-z0-9_]+)"/g
	}
];

const entries = [];
for (const catalog of catalogs) {
	const content = await readFile(resolve(repositoryRoot, catalog.source), "utf8");
	for (const match of content.matchAll(catalog.pattern)) {
		const identifier = match[1];
		entries.push({
			...classifyRegistration(identifier, catalog.kind),
			javaIdentifier: `create:${identifier}`,
			bedrockIdentifier: `createbedrock:${match[1]}`,
			kind: catalog.kind,
			source: catalog.source
		});
	}
}

entries.sort((left, right) => left.javaIdentifier.localeCompare(right.javaIdentifier) || left.kind.localeCompare(right.kind));

const matrix = {
	schemaVersion: MATRIX_SCHEMA_VERSION,
	classificationRulesVersion: 1,
	generatedFrom: "Create 6.0.11 / Minecraft Java 1.21.1 registration entry points",
	generatedAt: "deterministic",
	entries,
	manualReview: [
		"Dynamic Java registrations and generated variants are not statically enumerable; add their explicit mappings before declaring the migration matrix complete.",
		"Recipes, tags, packets, Ponder scenes, GameTests, compatibility integrations, and assets are tracked in follow-up matrix domains.",
		"Generated phase and domain assignments are reviewable rules, not proof of implementation or platform acceptance."
	]
};

await writeFile(resolve(bedrockRoot, "data", "migration-matrix.json"), `${JSON.stringify(matrix, null, "\t")}\n`);
console.log(`Wrote ${entries.length} statically declared migration entries.`);
