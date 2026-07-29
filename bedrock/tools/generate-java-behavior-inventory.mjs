import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildJavaBehaviorInventory } from "./java-behavior-inventory.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(bedrockRoot, "..");

const inventory = await buildJavaBehaviorInventory({ repositoryRoot });
await mkdir(resolve(bedrockRoot, "data"), { recursive: true });
await writeFile(resolve(bedrockRoot, "data", "java-behavior-inventory.json"), `${JSON.stringify(inventory, null, "\t")}\n`);
console.log(`Wrote ${inventory.summary.total} Java behavior-source records.`);
