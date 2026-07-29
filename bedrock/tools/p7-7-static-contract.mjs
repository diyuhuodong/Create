import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { deriveS315CompatibilityLedger, P77_SCENARIO_RULES, summarizeP77Acceptance, validateP77AcceptanceDocument, validateP77ScenarioCatalog } from "./p7-7-acceptance-schema.mjs";
import { validateP77CandidateDocument } from "./p7-7-candidate-schema.mjs";
import { buildP77CookingParityCatalog, renderP77CookingParityRecipes, validateP77CookingParityCatalog } from "./p7-7-cooking-parity.mjs";
import { buildP77AcceptanceWorldLayout, renderP77AcceptanceWorldLayout, validateP77AcceptanceWorldLayout } from "./p7-7-acceptance-world.mjs";
import { buildP77GapLedger, validateP77GapLedger } from "./p7-7-gap-ledger.mjs";
import { validateStage3PlatformAcceptanceDocument } from "./s3-15-platform-acceptance-schema.mjs";
import { buildJavaBehaviorInventory, validateJavaBehaviorInventory } from "./java-behavior-inventory.mjs";
import { buildP8ParityEvidenceLedger, validateP8ParityEvidenceLedger } from "./p8-parity-evidence-ledger.mjs";
import { buildDomainInventory } from "./domain-inventory.mjs";
import { buildJavaRegistrationCatalog } from "./java-registration-catalog.mjs";
import { buildMigrationLedger } from "./migration-ledger.mjs";

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
	const [behaviorManifest, resourceManifest, candidate, catalog, ledger, legacy, smokeTest, packageJson, gapLedger, migrationLedger, javaBehaviorInventory, parityEvidence, nativeRecipes, interactions, recipeIr, matrix, resources, cookingParity, cookingParityRuntime, acceptanceWorld, acceptanceWorldRuntime, overrides, domainOverrides] = await Promise.all([
		json(resolve(root, "behavior_pack", "manifest.json")),
		json(resolve(root, "resource_pack", "manifest.json")),
		json(resolve(trackingRoot, "data", "p7-7-candidate.json")),
		json(resolve(trackingRoot, "data", "p7-7-scenario-catalog.json")),
		json(resolve(trackingRoot, "data", "p7-7-acceptance.json")),
		json(resolve(trackingRoot, "data", "s3-15-platform-acceptance.json")),
		readFile(resolve(trackingRoot, "tests", "world", "smoke-test.md"), "utf8"),
		json(resolve(trackingRoot, "package.json")),
		json(resolve(trackingRoot, "data", "p7-7-gap-ledger.json")),
		json(resolve(trackingRoot, "data", "migration-ledger.json")),
		json(resolve(trackingRoot, "data", "java-behavior-inventory.json")),
		json(resolve(trackingRoot, "data", "p8-parity-evidence-ledger.json")),
		json(resolve(trackingRoot, "data", "recipes", "native.json")),
		json(resolve(trackingRoot, "data", "recipes", "interactions.json")),
		json(resolve(trackingRoot, "data", "recipes", "recipe-ir.json")),
		json(resolve(trackingRoot, "data", "migration-matrix.json")),
		json(resolve(trackingRoot, "data", "p7-6-resource-ledger.json")),
		json(resolve(trackingRoot, "data", "p7-7-cooking-parity.json")),
		readFile(resolve(root, "behavior_pack", "scripts", "processing", "generated", "cooking-parity-recipes.js"), "utf8"),
		json(resolve(trackingRoot, "data", "p7-7-acceptance-world.json")),
		readFile(resolve(root, "behavior_pack", "scripts", "acceptance", "generated", "acceptance-world-layout.js"), "utf8"),
		json(resolve(trackingRoot, "data", "migration-overrides.json")),
		json(resolve(trackingRoot, "data", "migration-domain-overrides.json"))
	]);
	const repositoryRoot = resolve(trackingRoot, "..");
	const [expectedCatalog, expectedDomainInventory] = await Promise.all([
		buildJavaRegistrationCatalog({ repositoryRoot }),
		buildDomainInventory({ repositoryRoot })
	]);
	const { ledger: expectedMigrationLedger } = await buildMigrationLedger({
		bedrockRoot: trackingRoot,
		catalog: expectedCatalog,
		domainInventory: expectedDomainInventory,
		matrix,
		overrides,
		domainOverrides
	});
	if (!sameJson(migrationLedger, expectedMigrationLedger))
		throw new Error("Migration ledger is stale; run npm run ledger.");
	const candidateCoverage = validateP77CandidateDocument(candidate, {
		behaviorManifest: candidate.state === "frozen" ? behaviorManifest : undefined,
		resourceManifest: candidate.state === "frozen" ? resourceManifest : undefined
	});
	const catalogCoverage = validateP77ScenarioCatalog(catalog);
	const acceptanceCoverage = validateP77AcceptanceDocument(ledger, { candidate, catalog });
	const expectedJavaBehaviorInventory = await buildJavaBehaviorInventory({ repositoryRoot });
	if (!sameJson(javaBehaviorInventory, expectedJavaBehaviorInventory))
		throw new Error("Java behavior inventory is stale; run npm run inventory:behaviors.");
	validateJavaBehaviorInventory(javaBehaviorInventory);
	const expectedParityEvidence = buildP8ParityEvidenceLedger({
		catalog: expectedCatalog,
		javaBehaviorInventory,
		matrix,
		migrationLedger: expectedMigrationLedger
	});
	if (!sameJson(parityEvidence, expectedParityEvidence))
		throw new Error("P8 parity evidence ledger is stale; run npm run evidence:p8.");
	validateP8ParityEvidenceLedger(parityEvidence);
	const expectedGapLedger = buildP77GapLedger({
		cookingParity,
		interactions,
		javaBehaviorInventory,
		matrix,
		migrationLedger,
		nativeRecipes,
		parityEvidence,
		recipeIr,
		resources,
		catalog
	});
	if (!sameJson(gapLedger, expectedGapLedger))
		throw new Error("P7.7 gap ledger is stale; run npm run gap:p7-7.");
	const gapCoverage = validateP77GapLedger(gapLedger);
	const unresolvedCoreGaps = gapCoverage.classifications.core_audit_required + gapCoverage.classifications.core_implementation_required;
	if (gapCoverage.classifications.platform_capability_blocked !== cookingParity.summary.recipes)
		throw new Error("P7.7 cooking capability blocks must match every managed cooking recipe");
	const expectedCookingParity = buildP77CookingParityCatalog(nativeRecipes);
	if (!sameJson(cookingParity, expectedCookingParity))
		throw new Error("P7.7 cooking parity catalog is stale; run npm run cooking:p7-7.");
	const cookingCoverage = validateP77CookingParityCatalog(cookingParity);
	if (cookingParityRuntime !== renderP77CookingParityRecipes(cookingParity))
		throw new Error("P7.7 generated cooking parity recipes are stale; run npm run cooking:p7-7.");
	const expectedAcceptanceWorld = buildP77AcceptanceWorldLayout(catalog);
	if (!sameJson(acceptanceWorld, expectedAcceptanceWorld))
		throw new Error("P7.7 acceptance world layout is stale; run npm run acceptance-world:p7-7.");
	const acceptanceWorldCoverage = validateP77AcceptanceWorldLayout(acceptanceWorld, catalog);
	if (acceptanceWorldCoverage.zones !== 10 || acceptanceWorldCoverage.scenarios !== 18 || acceptanceWorldCoverage.checkpoints !== 4)
		throw new Error("P7.7 static closure requires all ten zones, eighteen scenarios, and four checkpoints");
	if (acceptanceWorldRuntime !== renderP77AcceptanceWorldLayout(acceptanceWorld))
		throw new Error("P7.7 generated acceptance world layout is stale; run npm run acceptance-world:p7-7.");
	const expectedLegacy = deriveS315CompatibilityLedger({ candidate, catalog, ledger });
	if (!sameJson(legacy, expectedLegacy))
		throw new Error("S3-15 compatibility ledger is stale; derive it from P7.7 acceptance data");
	validateStage3PlatformAcceptanceDocument(legacy);
	for (const rule of P77_SCENARIO_RULES)
		if (!smokeTest.includes(`\`${rule.id}\``))
			throw new Error(`P7.7 smoke test is missing scenario ${rule.id}`);
	for (const marker of ["candidateId", "SHA-256", "Windows", "Realm", "PlayStation", "30-minute", "createbedrock:acceptance", "checkpoint W1", "W0"])
		if (!smokeTest.includes(marker))
			throw new Error(`P7.7 smoke test is missing ${marker} guidance`);
	for (const script of [
		"acceptance:p7-7:candidate",
		"acceptance:p7-7:new-report",
		"acceptance:p7-7:evidence",
		"acceptance:p7-7:content-log",
		"acceptance:p7-7:defect",
		"acceptance:p7-7:closeout",
		"gap:p7-7",
		"cooking:p7-7",
		"acceptance-world:p7-7",
		"acceptance:p7-7:status",
		"acceptance:p7-7:record",
		"acceptance:p7-7:validate"
	])
		if (typeof packageJson.scripts?.[script] !== "string")
			throw new Error(`P7.7 package script ${script} is missing`);
	return {
		candidateState: candidateCoverage.state,
		candidateId: candidateCoverage.candidateId,
		candidateSourceCommit: candidate.state === "frozen" ? candidate.source.commit : null,
		candidateArtifact: candidate.state === "frozen" ? candidate.artifact : null,
		scenarios: catalogCoverage.scenarios,
		applicableChecks: catalogCoverage.applicableChecks,
		campaigns: acceptanceCoverage.campaigns,
		runs: acceptanceCoverage.runs,
		outcome: acceptanceCoverage.outcome,
		gapLedger: gapCoverage,
		cookingParity: cookingCoverage,
		acceptanceWorld: acceptanceWorldCoverage,
		staticClosure: {
			coreAuditGaps: gapCoverage.classifications.core_audit_required,
			coreImplementationGaps: gapCoverage.classifications.core_implementation_required,
			cookingCapabilityBlocks: gapCoverage.classifications.platform_capability_blocked,
			platformChecksPending: gapCoverage.classifications.static_verified_pending_platform,
			ready: unresolvedCoreGaps === 0,
			unresolvedCoreGaps
		},
		summary: summarizeP77Acceptance({ candidate, catalog, ledger })
	};
}
