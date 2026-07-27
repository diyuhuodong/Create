import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildP71AcquisitionLedger } from "./p7-1-acquisition-ledger.mjs";

const bedrockRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ledger = await buildP71AcquisitionLedger({ bedrockRoot });
const output = resolve(bedrockRoot, "data/p7-1-acquisition-ledger.json");
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(ledger, null, "\t")}\n`);
console.log(`P7.1 acquisition ledger: ${ledger.entries.length} entries, ${ledger.summary.missing ?? 0} missing survival paths.`);
