import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildP77GapLedger } from "./p7-7-gap-ledger.mjs";

const bedrockRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function json(path) {
	return JSON.parse(await readFile(path, "utf8"));
}

const dataRoot = resolve(bedrockRoot, "data");
const document = buildP77GapLedger({
	cookingParity: await json(resolve(dataRoot, "p7-7-cooking-parity.json")),
	interactions: await json(resolve(dataRoot, "recipes", "interactions.json")),
	javaBehaviorInventory: await json(resolve(dataRoot, "java-behavior-inventory.json")),
	matrix: await json(resolve(dataRoot, "migration-matrix.json")),
	migrationLedger: await json(resolve(dataRoot, "migration-ledger.json")),
	nativeRecipes: await json(resolve(dataRoot, "recipes", "native.json")),
	parityEvidence: await json(resolve(dataRoot, "p8-parity-evidence-ledger.json")),
	recipeIr: await json(resolve(dataRoot, "recipes", "recipe-ir.json")),
	resources: await json(resolve(dataRoot, "p7-6-resource-ledger.json")),
	catalog: await json(resolve(dataRoot, "p7-7-scenario-catalog.json"))
});

await writeFile(resolve(dataRoot, "p7-7-gap-ledger.json"), `${JSON.stringify(document, null, "\t")}\n`);
console.log(`P7.7 gap ledger: ${document.summary.classifications.core_audit_required} behavior audits, ${document.summary.classifications.core_implementation_required} core gaps, ${document.summary.classifications.external_compat} external-compat entries, and ${document.summary.classifications.static_verified_pending_platform} pending platform checks.`);
