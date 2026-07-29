import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildP83SemanticRegistrationConvergence } from "./p8-3-semantic-registration-convergence.mjs";

const bedrockRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const data = name => readFile(resolve(bedrockRoot, "data", name), "utf8").then(JSON.parse);
const result = await buildP83SemanticRegistrationConvergence({ bedrockRoot, p82Convergence: await data("p8-2-registration-convergence.json"), overrides: await data("migration-overrides.json") });
await Promise.all([
	writeFile(resolve(bedrockRoot, "data", "migration-overrides.json"), `${JSON.stringify(result.overrides, null, "\t")}\n`),
	writeFile(resolve(bedrockRoot, "data", "p8-3-semantic-registration-convergence.json"), `${JSON.stringify(result.document, null, "\t")}\n`)
]);
console.log(`P8.3 semantic registration convergence: ${result.document.summary.resolved} of ${result.document.summary.total} P8.2 deferrals resolved.`);
