import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildP8IntegrityBaseline } from "./p8-integrity-baseline.mjs";

const bedrockRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const document = await buildP8IntegrityBaseline({ bedrockRoot });
await writeFile(resolve(bedrockRoot, "data", "p8-integrity-baseline.json"), `${JSON.stringify(document, null, "\t")}\n`);
console.log(`P8 C0 integrity baseline ${document.fingerprint}: ${document.documents.length} documents, ${document.authoritativeCounts.registrations} registrations, ${document.authoritativeCounts.domains} domains, and ${document.authoritativeCounts.behaviors} behaviors.`);

