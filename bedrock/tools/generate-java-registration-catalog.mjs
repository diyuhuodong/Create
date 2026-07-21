import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildJavaRegistrationCatalog } from "./java-registration-catalog.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(bedrockRoot, "..");

const catalog = await buildJavaRegistrationCatalog({ repositoryRoot });
await mkdir(resolve(bedrockRoot, "data"), { recursive: true });
await writeFile(resolve(bedrockRoot, "data", "java-registration-catalog.json"), `${JSON.stringify(catalog, null, "\t")}\n`);
console.log(`Wrote ${catalog.summary.total} Java registration records.`);
