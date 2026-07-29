import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildP8ParityEvidenceLedger } from "./p8-parity-evidence-ledger.mjs";

const bedrockRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = resolve(bedrockRoot, "data");
const json = path => readFile(resolve(dataRoot, path), "utf8").then(JSON.parse);

const ledger = buildP8ParityEvidenceLedger({
	catalog: await json("java-registration-catalog.json"),
	javaBehaviorInventory: await json("java-behavior-inventory.json"),
	matrix: await json("migration-matrix.json"),
	migrationLedger: await json("migration-ledger.json")
});
await writeFile(resolve(dataRoot, "p8-parity-evidence-ledger.json"), `${JSON.stringify(ledger, null, "\t")}\n`);
console.log(`P8 parity evidence: ${ledger.summary.total} records, ${ledger.summary.evidenceState.pending ?? 0} pending evidence links.`);
