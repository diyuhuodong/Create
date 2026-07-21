import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildDomainInventory } from "./domain-inventory.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(bedrockRoot, "..");

const inventory = await buildDomainInventory({ repositoryRoot });
await mkdir(resolve(bedrockRoot, "data"), { recursive: true });
await writeFile(resolve(bedrockRoot, "data", "domain-inventory.json"), `${JSON.stringify(inventory, null, "\t")}\n`);
console.log(`Wrote domain inventory for ${inventory.domains.reduce((total, domain) => total + domain.entries.length, 0)} source artifacts.`);
