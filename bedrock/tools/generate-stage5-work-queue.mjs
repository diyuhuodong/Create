import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateMigrationMatrix } from "./migration-matrix-schema.mjs";
import { STAGE5_WORK_QUEUE_SCHEMA_VERSION, stage5PackageFor, validateStage5WorkQueue } from "./stage5-work-queue-schema.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(toolDirectory, "..");

const PLANS = {
	"P5.1": {
		behaviorPlan: "Make TrainAuthority the sole owner of interlocking, signal state, observer passage edges, controller-rail commands, and bounded schedule progress.",
		persistencePlan: "Persist sharded train topology, train passage tokens, signal attachment/configuration, observer filters, and schedule revision/receipt state.",
		platformScenarios: ["signal-interlocking", "schedule-restart", "observer-redstone-edge"],
		resourcePlan: "Provide controller/signal/observer blocks, schedule item, native redstone declarations, recipes, drops, EN/ZH strings, and source asset provenance.",
		testPlan: "Test fail-closed signals, exclusive passage tokens, route release, observer filtering, bounded schedule edits, restart, and definition coverage."
	},
	"P5.2": {
		behaviorPlan: "Materialize rolling stock from TrainAuthority placement data and connect P4.5 carriage contraptions without a second route owner.",
		persistencePlan: "Persist bogey style/size, formation length, fake-track ownership, station door state, and idempotent disassembly receipts.",
		platformScenarios: ["bogey-formation", "station-door-interlock", "carriage-rejoin"],
		resourcePlan: "Provide bogey, fake-track, train-door/trapdoor blocks, recipes, drops, EN/ZH strings, and Java asset provenance.",
		testPlan: "Test formation spacing, occupied-sector release, door interlocks, fake-track cleanup, carriage authority integration, restart, and resource coverage."
	},
	"P5.3": {
		behaviorPlan: "Use PackageLedger and the existing durable item ports to create, unpack, repackage, filter, and project packages without duplicate inventory ownership.",
		persistencePlan: "Persist package identity, bounded contents, address/order data, port/escrow ownership, state revision, and idempotency receipts.",
		platformScenarios: ["packager-restart", "repackager-conservation", "package-full-endpoint"],
		resourcePlan: "Provide package entity/item/filter and Packager/Repackager blocks, recipes, drops, EN/ZH strings, and Java asset provenance.",
		testPlan: "Test 9-slot bounds, conservation, address/order preservation, redstone gating, full-target retry, ownership recovery, and definitions."
	},
	"P5.4": {
		behaviorPlan: "Route PackageLedger records through Frogport, Postbox, Packager Link, Stock Link and Factory Gauge endpoints using deterministic address selection and offline buffering.",
		persistencePlan: "Persist endpoint address/configuration, pending delivery cursor, offline buffers, factory-panel requests, and delivery receipts in sharded records.",
		platformScenarios: ["frogport-routing", "postbox-offline-recovery", "factory-gauge-request"],
		resourcePlan: "Provide all endpoint/gauge blocks, colored Postbox family coverage, recipes, drops, EN/ZH strings, and Java asset provenance.",
		testPlan: "Test deterministic routing, endpoint competition, full/disconnected retry, offline buffers, stock requests, panel aggregation, restart, and resources."
	}
};

function planFor(entry) {
	const deliveryPackage = stage5PackageFor(entry);
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
	schemaVersion: STAGE5_WORK_QUEUE_SCHEMA_VERSION,
	generatedAt: "deterministic",
	generatedFrom: "bedrock/data/migration-matrix.json",
	entries: matrix.entries.filter(entry => entry.phase === 5).map(planFor).sort((left, right) => left.acceptanceId.localeCompare(right.acceptanceId))
};
const coverage = validateStage5WorkQueue(queue, matrix);
await writeFile(resolve(bedrockRoot, "data", "stage5-work-queue.json"), `${JSON.stringify(queue, null, 2)}\n`);
console.log(`Wrote ${coverage.entries} Stage-5 work queue entries.`);
