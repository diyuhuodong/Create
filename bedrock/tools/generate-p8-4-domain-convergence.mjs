import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildP84DomainConvergence } from "./p8-4-domain-convergence.mjs";

const bedrockRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const data = name => readFile(resolve(bedrockRoot, "data", name), "utf8").then(JSON.parse);
const document = await buildP84DomainConvergence({ bedrockRoot, domainInventory: await data("domain-inventory.json"), recipeIr: await data("recipes/recipe-ir.json"), resourceLedger: await data("p7-6-resource-ledger.json"), tagProjections: await data("recipes/tag-projections.json") });
await writeFile(resolve(bedrockRoot, "data", "p8-4-domain-convergence.json"), `${JSON.stringify(document, null, "\t")}\n`);
console.log(`P8.4 domain convergence: ${document.entries.length} entries, ${document.summary.equivalent ?? 0} equivalent, ${document.summary.not_applicable ?? 0} replaced, ${document.summary.deferred_compat ?? 0} external.`);
