import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateMigrationMatrix } from "./migration-matrix-schema.mjs";
import { STAGE4_WORK_QUEUE_SCHEMA_VERSION, stage4PackageFor, validateStage4WorkQueue } from "./stage4-work-queue-schema.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(toolDirectory, "..");

const PLANS = {
	"P4.1": {
		behaviorPlan: "Connect Mechanical/Windmill Bearing ownership and Contraption Controls to DynamicAssemblyController; projections remain non-authoritative.",
		persistencePlan: "Persist a sharded dynamic_assembly root, snapshot shards, transform, epoch, phase, owner, and frozen reason.",
		platformScenarios: ["assembly-restart", "projection-loss-recovery", "bearing-disassembly"],
		resourcePlan: "Provide purpose-specific BP/RP definitions, creative access, EN/ZH text, Java asset provenance, recipe, and drop behavior.",
		testPlan: "Test assembly ownership, 512-block collection, rollback, restart restoration, projection regeneration, and definition coverage."
	},
	"P4.2": {
		behaviorPlan: "Drive linear translation from kinetic speed through DynamicAssemblyController and swept occupancy; conflicting movement freezes safely.",
		persistencePlan: "Persist actuator direction, extension, target, kinetic dependency, dynamic assembly ID, and recovery/frozen state.",
		platformScenarios: ["linear-reverse", "linear-collision-freeze", "linear-restart"],
		resourcePlan: "Provide block states, head/rope projection resources, creative access, EN/ZH text, source-derived recipes, and drops.",
		testPlan: "Test extension, retraction, reversal, collision, unload/restart, destination reservation, and all acceptance definitions."
	},
	"P4.3": {
		behaviorPlan: "Use column-owned elevator state and transform-sampled moving contacts; only contact edges write native redstone outputs.",
		persistencePlan: "Persist column X/Z, floor ID/name, facing, requests, cabin state, current floor, and contact edge state.",
		platformScenarios: ["elevator-floor-crossing", "moving-contact-edge", "elevator-restart"],
		resourcePlan: "Provide independent Elevator Contact/Pulley BP/RP definitions, language, recipes, drops, and visible floor feedback.",
		testPlan: "Test exactly-once floor arrival, opposing-face contacts, redstone rise/fall, column isolation, and restart recovery."
	},
	"P4.4": {
		behaviorPlan: "Execute actor targets and item/fluid/process effects at authoritative snapshot coordinates through durable transaction ports.",
		persistencePlan: "Persist actor configuration, cooldown, target selection, inventories, pending work, and idempotency receipts in moving data.",
		platformScenarios: ["actor-item-conservation", "actor-restart", "actor-concurrent-target"],
		resourcePlan: "Provide actor blocks/items/resources, creative access, EN/ZH text, Java-derived recipes/drops, and no placeholder actors.",
		testPlan: "Test target selection, cooldown, transaction rollback, inventory conservation, restart, and conflicting actor ownership."
	},
	"P4.5": {
		behaviorPlan: "Assemble contraption minecarts and passengers transactionally while reusing track-route persistence without claiming Stage-5 scheduling.",
		persistencePlan: "Persist cart/assembly identity, seat/passenger binding, route reservation, coupling endpoints, and safe disassembly state.",
		platformScenarios: ["minecart-assemble-disassemble", "seat-rejoin", "coupling-restart"],
		resourcePlan: "Provide cart items, entities, BP/RP definitions, language, recipes, drops, and explicit creative access.",
		testPlan: "Test cart ownership, passenger lifecycle, route conflicts, coupling idempotency, recovery, and all entity/item definitions."
	},
	"P4.6": {
		behaviorPlan: "Use a deterministic Sticker/Super Glue graph to include or reject blocks before a dynamic assembly transaction begins.",
		persistencePlan: "Persist sticker orientation/state and glue attachment references; rebuild only from authoritative world or snapshot data.",
		platformScenarios: ["sticker-attachment", "sticker-conflict", "sticker-restart"],
		resourcePlan: "Provide Sticker BP/RP definitions, language, creative access, Java-derived recipes, and drops.",
		testPlan: "Test graph traversal, cycles, invalid targets, cross-assembly conflicts, detach/restore ordering, and resource coverage."
	},
	"P4.7": {
		behaviorPlan: "Use versioned, allowlisted snapshots and bounded transactional placement for blueprints, cannon batches, clipboard text, and symmetry.",
		persistencePlan: "Persist blueprint schema/version, bounded block payloads, placement cursor, owner, reservation journal, and rollback state.",
		platformScenarios: ["schematic-conflict-rollback", "schematic-restart", "schematic-multiplayer"],
		resourcePlan: "Provide schematic item/block/entity resources, language, creative access, Java-derived acquisition, and visible placement feedback.",
		testPlan: "Test schema migration, allowlist rejection, preflight failure, partial-write rollback, bounded batches, restart, and concurrency."
	}
};

function planFor(entry) {
	const deliveryPackage = stage4PackageFor(entry);
	const plan = PLANS[deliveryPackage];
	return {
		acceptanceId: entry.acceptanceId,
		assetPlan: `Trace ${entry.kind} resources to ${entry.source}; do not claim Java visual parity until BP/RP conversion is tested in game.`,
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
	schemaVersion: STAGE4_WORK_QUEUE_SCHEMA_VERSION,
	generatedAt: "deterministic",
	generatedFrom: "bedrock/data/migration-matrix.json",
	entries: matrix.entries
		.filter(entry => entry.phase === 4)
		.map(planFor)
		.sort((left, right) => left.acceptanceId.localeCompare(right.acceptanceId))
};
const coverage = validateStage4WorkQueue(queue, matrix);
await writeFile(resolve(bedrockRoot, "data", "stage4-work-queue.json"), `${JSON.stringify(queue, null, 2)}\n`);
console.log(`Wrote ${coverage.entries} Stage-4 work queue entries.`);
