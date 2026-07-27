import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { deriveS315CompatibilityLedger, P77_SCENARIO_RULES, summarizeP77Acceptance, validateP77AcceptanceDocument, validateP77ScenarioCatalog } from "./p7-7-acceptance-schema.mjs";
import { validateP77CandidateDocument } from "./p7-7-candidate-schema.mjs";
import { buildP77CookingParityCatalog, renderP77CookingParityRecipes, validateP77CookingParityCatalog } from "./p7-7-cooking-parity.mjs";
import { buildP77GapLedger, validateP77GapLedger } from "./p7-7-gap-ledger.mjs";
import { validateStage3PlatformAcceptanceDocument } from "./s3-15-platform-acceptance-schema.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");

async function json(file) {
	return JSON.parse(await readFile(file, "utf8"));
}

function sameJson(left, right) {
	return JSON.stringify(left) === JSON.stringify(right);
}

export async function validateP77StaticContract({
	root = defaultBedrockRoot,
	trackingRoot = defaultBedrockRoot
} = {}) {
	const [behaviorManifest, resourceManifest, candidate, catalog, ledger, legacy, smokeTest, packageJson, gapLedger, nativeRecipes, interactions, recipeIr, matrix, resources, cookingParity, cookingParityRuntime] = await Promise.all([
		json(resolve(root, "behavior_pack", "manifest.json")),
		json(resolve(root, "resource_pack", "manifest.json")),
		json(resolve(trackingRoot, "data", "p7-7-candidate.json")),
		json(resolve(trackingRoot, "data", "p7-7-scenario-catalog.json")),
		json(resolve(trackingRoot, "data", "p7-7-acceptance.json")),
		json(resolve(trackingRoot, "data", "s3-15-platform-acceptance.json")),
		readFile(resolve(trackingRoot, "tests", "world", "smoke-test.md"), "utf8"),
		json(resolve(trackingRoot, "package.json")),
		json(resolve(trackingRoot, "data", "p7-7-gap-ledger.json")),
		json(resolve(trackingRoot, "data", "recipes", "native.json")),
		json(resolve(trackingRoot, "data", "recipes", "interactions.json")),
		json(resolve(trackingRoot, "data", "recipes", "recipe-ir.json")),
		json(resolve(trackingRoot, "data", "migration-matrix.json")),
		json(resolve(trackingRoot, "data", "p7-6-resource-ledger.json"))
		,
		json(resolve(trackingRoot, "data", "p7-7-cooking-parity.json")),
		readFile(resolve(root, "behavior_pack", "scripts", "processing", "generated", "cooking-parity-recipes.js"), "utf8")
	]);
	const candidateCoverage = validateP77CandidateDocument(candidate, {
		behaviorManifest: candidate.state === "frozen" ? behaviorManifest : undefined,
		resourceManifest: candidate.state === "frozen" ? resourceManifest : undefined
	});
	const catalogCoverage = validateP77ScenarioCatalog(catalog);
	const acceptanceCoverage = validateP77AcceptanceDocument(ledger, { candidate, catalog });
	const expectedGapLedger = buildP77GapLedger({ cookingParity, interactions, matrix, nativeRecipes, recipeIr, resources, catalog });
	if (!sameJson(gapLedger, expectedGapLedger))
		throw new Error("P7.7 gap ledger is stale; run npm run gap:p7-7.");
	const gapCoverage = validateP77GapLedger(gapLedger);
	const expectedCookingParity = buildP77CookingParityCatalog(nativeRecipes);
	if (!sameJson(cookingParity, expectedCookingParity))
		throw new Error("P7.7 cooking parity catalog is stale; run npm run cooking:p7-7.");
	const cookingCoverage = validateP77CookingParityCatalog(cookingParity);
	if (cookingParityRuntime !== renderP77CookingParityRecipes(cookingParity))
		throw new Error("P7.7 generated cooking parity recipes are stale; run npm run cooking:p7-7.");
	const expectedLegacy = deriveS315CompatibilityLedger({ candidate, catalog, ledger });
	if (!sameJson(legacy, expectedLegacy))
		throw new Error("S3-15 compatibility ledger is stale; derive it from P7.7 acceptance data");
	validateStage3PlatformAcceptanceDocument(legacy);
	for (const rule of P77_SCENARIO_RULES)
		if (!smokeTest.includes(`\`${rule.id}\``))
			throw new Error(`P7.7 smoke test is missing scenario ${rule.id}`);
	for (const marker of ["candidateId", "SHA-256", "Windows", "Realm", "PlayStation", "30-minute"])
		if (!smokeTest.includes(marker))
			throw new Error(`P7.7 smoke test is missing ${marker} guidance`);
	for (const script of [
		"acceptance:p7-7:candidate",
		"gap:p7-7",
		"cooking:p7-7",
		"acceptance:p7-7:status",
		"acceptance:p7-7:record",
		"acceptance:p7-7:validate"
	])
		if (typeof packageJson.scripts?.[script] !== "string")
			throw new Error(`P7.7 package script ${script} is missing`);
	return {
		candidateState: candidateCoverage.state,
		candidateId: candidateCoverage.candidateId,
		scenarios: catalogCoverage.scenarios,
		applicableChecks: catalogCoverage.applicableChecks,
		campaigns: acceptanceCoverage.campaigns,
		runs: acceptanceCoverage.runs,
		outcome: acceptanceCoverage.outcome,
		gapLedger: gapCoverage,
		cookingParity: cookingCoverage,
		summary: summarizeP77Acceptance({ candidate, catalog, ledger })
	};
}
