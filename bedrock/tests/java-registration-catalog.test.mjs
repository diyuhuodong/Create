import assert from "node:assert/strict";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

import { buildJavaRegistrationCatalog } from "../tools/java-registration-catalog.mjs";
import { validateJavaRegistrationCatalog } from "../tools/java-registration-catalog-schema.mjs";
import { buildMigrationLedger } from "../tools/migration-ledger.mjs";
import { validateMigrationLedger, validateMigrationOverrides } from "../tools/migration-ledger-schema.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(testDirectory, "..");
const repositoryRoot = resolve(bedrockRoot, "..");

test("Java registration catalog includes dynamic content families and rejects synthetic string fragments", async () => {
	const catalog = await buildJavaRegistrationCatalog({ repositoryRoot });
	assert.doesNotThrow(() => validateJavaRegistrationCatalog(catalog));
	assert.deepEqual(catalog.summary, {
		block: 643,
		block_entity: 114,
		entity: 9,
		fluid: 4,
		item: 111,
		total: 881
	});
	const sourceKeys = new Set(catalog.entries.map(entry => entry.sourceKey));
	for (const sourceKey of [
		"block:create:pink_sail",
		"block:create:waxed_oxidized_copper_shingles",
		"fluid:create:chocolate",
		"item:create:chocolate_bucket",
		"item:create:cardboard_package_12x12",
		"item:create:rare_creeper_package",
		"item:create:crushed_raw_osmium"
	])
		assert.ok(sourceKeys.has(sourceKey), `catalog is missing ${sourceKey}`);
	assert.ok(!sourceKeys.has("item:create:crushed_raw_"));
	const generatedCatalog = await readFile(resolve(bedrockRoot, "data", "java-registration-catalog.json"), "utf8").then(JSON.parse);
	assert.deepEqual(generatedCatalog, catalog);
});

test("migration ledger covers every Java registration and records reviewed mappings only through overrides", async () => {
	const [catalog, domainInventory, matrix, overrides] = await Promise.all([
		buildJavaRegistrationCatalog({ repositoryRoot }),
		readFile(resolve(bedrockRoot, "data", "domain-inventory.json"), "utf8").then(JSON.parse),
		readFile(resolve(bedrockRoot, "data", "migration-matrix.json"), "utf8").then(JSON.parse),
		readFile(resolve(bedrockRoot, "data", "migration-overrides.json"), "utf8").then(JSON.parse)
	]);
	assert.deepEqual(validateMigrationOverrides(overrides, catalog), { entries: 503 });
	const { ledger } = await buildMigrationLedger({ bedrockRoot, catalog, domainInventory, matrix, overrides });
	assert.deepEqual(validateMigrationLedger(ledger, catalog, domainInventory), { domains: 9067, registrations: 881 });
	assert.equal(ledger.registrationEntries.filter(entry => entry.status === "unclassified").length, 378);
	assert.deepEqual(ledger.registrationEntries.find(entry => entry.sourceKey === "item:create:brass_sheet").mapping, {
		relation: "one_to_one",
		targets: ["createbedrock:brass_sheet"]
	});
	assert.equal(ledger.registrationEntries.find(entry => entry.sourceKey === "item:create:vertical_gearbox").candidateTargets.length, 0);
	assert.equal(ledger.registrationEntries.find(entry => entry.sourceKey === "block:create:shaft").candidateTargets[0], "createbedrock:shaft");
	const generatedLedger = await readFile(resolve(bedrockRoot, "data", "migration-ledger.json"), "utf8").then(JSON.parse);
	assert.deepEqual(generatedLedger, ledger);
});
