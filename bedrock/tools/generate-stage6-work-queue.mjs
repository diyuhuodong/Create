import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateMigrationMatrix } from "./migration-matrix-schema.mjs";
import { STAGE6_WORK_QUEUE_SCHEMA_VERSION, stage6PackageFor, validateStage6WorkQueue } from "./stage6-work-queue-schema.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(toolDirectory, "..");

const PLANS = {
	"P6.1": {
		behaviorPlan: "Persist stationary Backtank air records, charge them from the kinetic network, and use chest/head/feet equipment ticks for diving air, movement, and Netherite heat protection.",
		persistencePlan: "Shard stationary Backtank air/timer records by chunk; store carried Backtank air only on the non-stackable ItemStack dynamic property.",
		platformScenarios: ["backtank-kinetic-charge", "diving-air-consumption", "netherite-lava-protection"],
		resourcePlan: "Provide copper/netherite Backtank blocks and placeable/wearable items, diving armor, recipes, drops, language keys, texture provenance, and armor render coverage.",
		testPlan: "Test capacity, refill cadence, air consumption, waterlogged stops, armor eligibility, stationary persistence, item-state round trips, recipes, and definitions."
	},
	"P6.2": {
		behaviorPlan: "Provide goggles diagnostics, safe wrench rotations/disassembly, and a Create-only synthetic Extendo interaction path with Backtank-backed reach actions.",
		persistencePlan: "Keep tool settings transient; persist only Backtank air consumed by Extendo actions through the carried-item state codec.",
		platformScenarios: ["goggles-network-overlay", "wrench-rotate-disassemble", "extendo-synthetic-reach"],
		resourcePlan: "Provide wearable goggles plus wrench and Extendo items, recipes, language keys, texture provenance, and explicit native-reach limitation coverage.",
		testPlan: "Test target selection, wrench state transitions, synthetic reach bounds, dual-grip range, Backtank fallback, and definitions."
	},
	"P6.3": {
		behaviorPlan: "Consume a compatible inventory item, apply a durable Cannon cooldown, launch the existing server-authoritative projectile entity, and use Backtank air before item durability.",
		persistencePlan: "Store Cannon cooldown on its non-stackable ItemStack dynamic property; projectile state remains entity dynamic properties owned by the existing projectile runtime.",
		platformScenarios: ["potato-cannon-ammo", "potato-cannon-backtank", "potato-cannon-restart"],
		resourcePlan: "Provide Potato Cannon item, mechanical-crafting source mapping, language/texture provenance, and all recognized vanilla/Create ammunition coverage.",
		testPlan: "Test cooldown exclusion, ammo conservation, projectile profile handoff, air-or-durability cost, restart codec, and definition coverage."
	},
	"P6.4": {
		behaviorPlan: "Persist 16-color Toolbox block records with eight filtered four-stack compartments, deterministic extraction, player-range attachment, and a form-based interaction surface.",
		persistencePlan: "Shard Toolbox block records by chunk; carried Toolboxes retain the same normalized record through their non-stackable ItemStack dynamic property.",
		platformScenarios: ["toolbox-filtered-storage", "toolbox-player-range", "toolbox-restart"],
		resourcePlan: "Provide the 16-color Toolbox family, recipes, drops, language keys, texture provenance, and model/geometry coverage.",
		testPlan: "Test eight-compartment bounds, filter enforcement, deterministic transfers, block/item persistence, range attachment, concurrent edits, restart, and family definitions."
	}
};

function planFor(entry) {
	const deliveryPackage = stage6PackageFor(entry);
	const plan = PLANS[deliveryPackage];
	return {
		acceptanceId: entry.acceptanceId,
		assetPlan: `Trace ${entry.kind} resources to ${entry.source}; Java visual parity remains pending until it is tested in a real Bedrock client.`,
		behaviorPlan: plan.behaviorPlan,
		bedrockIdentifier: entry.bedrockIdentifier,
		deliveryPackage: entry.status === "static_verified" ? `completed:${deliveryPackage}` : deliveryPackage,
		domain: entry.domain,
		javaIdentifier: entry.javaIdentifier,
		javaSource: entry.source,
		kind: entry.kind,
		matrixStatus: entry.status,
		persistencePlan: plan.persistencePlan,
		platformScenarios: plan.platformScenarios,
		resourcePlan: plan.resourcePlan,
		testPlan: plan.testPlan
	};
}

const matrix = JSON.parse(await readFile(resolve(bedrockRoot, "data", "migration-matrix.json"), "utf8"));
validateMigrationMatrix(matrix);
const queue = {
	schemaVersion: STAGE6_WORK_QUEUE_SCHEMA_VERSION,
	generatedAt: "deterministic",
	generatedFrom: "bedrock/data/migration-matrix.json",
	entries: matrix.entries.filter(entry => entry.phase === 6).map(planFor).sort((left, right) => left.acceptanceId.localeCompare(right.acceptanceId))
};
const coverage = validateStage6WorkQueue(queue, matrix);
await writeFile(resolve(bedrockRoot, "data", "stage6-work-queue.json"), `${JSON.stringify(queue, null, 2)}\n`);
console.log(`Wrote ${coverage.entries} Stage-6 work queue entries.`);
