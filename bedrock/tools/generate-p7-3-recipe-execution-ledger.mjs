import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildP73RecipeExecutionLedger } from "./p7-3-recipe-execution-ledger.mjs";

const bedrockRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ledger = await buildP73RecipeExecutionLedger({ bedrockRoot });
const output = resolve(bedrockRoot, "data/p7-3-recipe-execution-ledger.json");
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(ledger, null, "\t")}\n`);
console.log(`P7.3 recipe execution ledger: ${ledger.entries.length} recipes, ${ledger.staticCovered} statically covered, ${ledger.summary.external_compatibility ?? 0} external compatibility recipes.`);
