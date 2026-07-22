import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildP76GuidanceLedger, buildP76ResourceLedger, buildP76WorkQueue } from "./p7-6-catalogs.mjs";

const bedrockRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(bedrockRoot, "..");
const domainInventory = JSON.parse(await readFile(resolve(bedrockRoot, "data/domain-inventory.json"), "utf8"));

const documents = new Map([
	["p7-6-work-queue.json", buildP76WorkQueue()],
	["p7-6-resource-ledger.json", buildP76ResourceLedger(domainInventory)],
	["p7-6-guidance-ledger.json", await buildP76GuidanceLedger({ domainInventory, repositoryRoot })]
]);

for (const [name, document] of documents)
	await writeFile(resolve(bedrockRoot, "data", name), `${JSON.stringify(document, null, "\t")}\n`);

console.log(`Generated P7.6 catalogs: ${documents.get("p7-6-resource-ledger.json").summary.total} resources and ${documents.get("p7-6-guidance-ledger.json").summary.sceneFamilies} guidance families.`);
