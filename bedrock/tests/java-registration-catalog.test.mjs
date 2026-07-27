import assert from "node:assert/strict";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

import { buildJavaRegistrationCatalog } from "../tools/java-registration-catalog.mjs";
import { validateJavaRegistrationCatalog } from "../tools/java-registration-catalog-schema.mjs";
import { buildDomainInventory } from "../tools/domain-inventory.mjs";
import { buildMigrationLedger } from "../tools/migration-ledger.mjs";
import { validateMigrationDomainOverrides, validateMigrationLedger, validateMigrationOverrides } from "../tools/migration-ledger-schema.mjs";

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

test("migration ledger covers every Java registration and assigns R1 ownership to every source domain", async () => {
	const [catalog, domainInventory, matrix, overrides, domainOverrides] = await Promise.all([
		buildJavaRegistrationCatalog({ repositoryRoot }),
		buildDomainInventory({ repositoryRoot }),
		readFile(resolve(bedrockRoot, "data", "migration-matrix.json"), "utf8").then(JSON.parse),
		readFile(resolve(bedrockRoot, "data", "migration-overrides.json"), "utf8").then(JSON.parse),
		readFile(resolve(bedrockRoot, "data", "migration-domain-overrides.json"), "utf8").then(JSON.parse)
	]);
	assert.deepEqual(validateMigrationOverrides(overrides, catalog), { entries: 503 });
	assert.deepEqual(validateMigrationDomainOverrides(domainOverrides, domainInventory), { rules: 10 });
	const { definitions, ledger } = await buildMigrationLedger({ bedrockRoot, catalog, domainInventory, matrix, overrides, domainOverrides });
	assert.deepEqual(validateMigrationLedger(ledger, catalog, domainInventory), { domains: 9067, registrations: 881, domainEntries: 9067 });
	assert.equal(ledger.registrationEntries.filter(entry => entry.status === "unclassified").length, 0);
	assert.equal(ledger.domainEntries.length, 9067);
	assert.ok(ledger.domainEntries.every(entry => entry.status !== "unclassified" && entry.owner !== "R0/unassigned"));
	assert.equal(new Set(ledger.domainEntries.map(entry => entry.sourceKey)).size, ledger.domainEntries.length);
	assert.ok(ledger.domainEntries.some(entry => entry.sourceKey.startsWith("domain:game_tests:") && !entry.sourceKey.endsWith("#void")));
	const incompleteRules = structuredClone(domainOverrides);
	incompleteRules.rules.pop();
	assert.throws(() => validateMigrationDomainOverrides(incompleteRules, domainInventory), /missing game_tests/);
	const incomplete = structuredClone(ledger);
	incomplete.domainEntries.pop();
	assert.throws(() => validateMigrationLedger(incomplete, catalog, domainInventory), /missing domain inventory entry|domain entry count/);
	assert.deepEqual(ledger.registrationEntries.find(entry => entry.sourceKey === "item:create:brass_sheet").mapping, {
		relation: "one_to_one",
		targets: ["createbedrock:brass_sheet"]
	});
	for (const sourceKey of [
		"block_entity:create:blaze_heater",
		"block_entity:create:bogey",
		"block_entity:create:chassis",
		"block_entity:create:copycat",
		"block_entity:create:cursed_bell",
		"block_entity:create:drill",
		"block_entity:create:encased_cogwheel",
		"block_entity:create:encased_large_cogwheel",
		"block_entity:create:encased_shaft",
		"block_entity:create:factory_panel",
		"block_entity:create:flap_display",
		"block_entity:create:funnel",
		"block_entity:create:gantry_pinion",
		"block_entity:create:harvester",
		"block_entity:create:motor",
		"block_entity:create:saw",
		"block_entity:create:simple_kinetic",
		"block_entity:create:sliding_door",
		"block_entity:create:table_cloth",
		"block_entity:create:valve_handle"
	]) {
		const entry = ledger.registrationEntries.find(candidate => candidate.sourceKey === sourceKey);
		assert.equal(entry.status, "partial", `${sourceKey} needs an explicit virtualized block projection`);
		assert.equal(entry.mapping.relation, "virtualized");
		assert.ok(entry.mapping.targets.length > 0);
		assert.ok(entry.mapping.targets.every(target => definitions.block.has(target)), `${sourceKey} references a missing Bedrock block definition`);
	}
	assert.equal(ledger.registrationEntries.find(entry => entry.sourceKey === "item:create:vertical_gearbox").candidateTargets.length, 0);
	assert.equal(ledger.registrationEntries.find(entry => entry.sourceKey === "block:create:shaft").candidateTargets[0], "createbedrock:shaft");
	const generatedLedger = await readFile(resolve(bedrockRoot, "data", "migration-ledger.json"), "utf8").then(JSON.parse);
	assert.deepEqual(generatedLedger, ledger);
});
