import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { generateP71ContentFamilies } from "./p7-1-content-families.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(bedrockRoot, "..");
const coverage = await generateP71ContentFamilies({ bedrockRoot, repositoryRoot });

console.log(`P7.1 content families: ${coverage.blocks} blocks and ${coverage.items} standalone items generated; ${coverage.resourceFallbacks} source-asset fallbacks remain.`);
