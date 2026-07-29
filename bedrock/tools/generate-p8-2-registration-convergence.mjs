import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildP82RegistrationConvergence } from "./p8-2-registration-convergence.mjs";

const bedrockRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const data = name => readFile(resolve(bedrockRoot, "data", name), "utf8").then(JSON.parse);
const result = await buildP82RegistrationConvergence({
	bedrockRoot,
	catalog: await data("java-registration-catalog.json"),
	matrix: await data("migration-matrix.json"),
	overrides: await data("migration-overrides.json")
});
await Promise.all([
	writeFile(resolve(bedrockRoot, "data", "migration-overrides.json"), `${JSON.stringify(result.overrides, null, "\t")}\n`),
	writeFile(resolve(bedrockRoot, "data", "p8-2-registration-convergence.json"), `${JSON.stringify(result.document, null, "\t")}\n`)
]);
console.log(`P8.2 registration convergence: ${result.document.summary.resolved} resolved and ${result.document.summary.deferred} deferred to P8.3.`);
