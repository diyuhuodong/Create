import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildMigrationLedger } from "./migration-ledger.mjs";
import { validateJavaRegistrationCatalog } from "./java-registration-catalog-schema.mjs";
import { validateMigrationMatrix } from "./migration-matrix-schema.mjs";
import { validateMigrationDomainOverrides, validateMigrationOverrides } from "./migration-ledger-schema.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(toolDirectory, "..");

const [catalog, domainInventory, matrix, overrides, domainOverrides, domainConvergence] = await Promise.all([
	readFile(resolve(bedrockRoot, "data", "java-registration-catalog.json"), "utf8").then(JSON.parse),
	readFile(resolve(bedrockRoot, "data", "domain-inventory.json"), "utf8").then(JSON.parse),
	readFile(resolve(bedrockRoot, "data", "migration-matrix.json"), "utf8").then(JSON.parse),
	readFile(resolve(bedrockRoot, "data", "migration-overrides.json"), "utf8").then(JSON.parse),
	readFile(resolve(bedrockRoot, "data", "migration-domain-overrides.json"), "utf8").then(JSON.parse),
	readFile(resolve(bedrockRoot, "data", "p8-4-domain-convergence.json"), "utf8").then(JSON.parse)
]);
validateJavaRegistrationCatalog(catalog);
validateMigrationMatrix(matrix);
validateMigrationOverrides(overrides, catalog);
validateMigrationDomainOverrides(domainOverrides, domainInventory);
const { ledger } = await buildMigrationLedger({ bedrockRoot, catalog, domainInventory, matrix, overrides, domainOverrides, domainConvergence });
await writeFile(resolve(bedrockRoot, "data", "migration-ledger.json"), `${JSON.stringify(ledger, null, "\t")}\n`);
console.log(`Wrote ${ledger.registrationEntries.length} registration records and linked ${ledger.domainInventory.total} domain records.`);
