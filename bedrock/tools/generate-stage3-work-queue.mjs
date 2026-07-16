import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
	REDSTONE_NATIVE_COMPONENT_BASELINE,
	STAGE_THREE_FLUID_FOUNDATION,
	STAGE_THREE_KINETIC_FOUNDATION,
	STAGE_THREE_LOGISTICS_FOUNDATION,
	STAGE_THREE_PROCESSING_FOUNDATION
} from "./migration-classification.mjs";
import { validateMigrationMatrix } from "./migration-matrix-schema.mjs";
import { STAGE3_WORK_QUEUE_SCHEMA_VERSION, validateStage3WorkQueue } from "./stage3-work-queue-schema.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(toolDirectory, "..");

const FOUNDATION_ACCEPTANCE_IDS = new Set([
	"CONTENT-ANDESITE-ALLOY-BLOCK-BLOCK",
    "CONTENT-DEEPSLATE-ZINC-ORE-BLOCK",
    "CONTENT-RAW-ZINC-BLOCK-BLOCK",
	"CONTENT-ROSE-QUARTZ-BLOCK-BLOCK",
    "CONTENT-WEATHERED-IRON-BLOCK-BLOCK",
    "CONTENT-ZINC-ORE-BLOCK"
]);

const DELIVERY_BY_DOMAIN = new Map([
    ["kinetics", "S3-9"],
    ["logistics", "S3-10"],
    ["processing", "S3-11"],
    ["fluids", "S3-12"],
    ["redstone", "S3-14"]
]);

function planFor(entry) {
    if (entry.status === "static_verified" && entry.domain !== "content") {
		const identifier = entry.javaIdentifier.slice("create:".length);
		const deliveryPackage = STAGE_THREE_KINETIC_FOUNDATION.has(identifier)
			? "completed:S3-9"
			: STAGE_THREE_LOGISTICS_FOUNDATION.has(identifier)
				? "completed:S3-10"
			: STAGE_THREE_PROCESSING_FOUNDATION.has(identifier)
				? "completed:S3-11"
				: STAGE_THREE_FLUID_FOUNDATION.has(identifier)
					? "completed:S3-12"
					: "completed:S3-7";
		return {
			dependencies: [deliveryPackage === "completed:S3-9"
				? "S3-9 kinetic source contract"
				: deliveryPackage === "completed:S3-10"
					? "S3-10 logistics source contract"
					: deliveryPackage === "completed:S3-11"
						? "S3-11 processing source contract"
						: deliveryPackage === "completed:S3-12"
							? "S3-12 fluid source contract"
							: "S3-7 static content contract"],
            deliveryPackage,
            assetPlan: `Tracked by the ${deliveryPackage.slice("completed:".length)} source and built content contract.`,
            lootPlan: "Audit Java-equivalent drops in the owning system package.",
            recipePlan: "Audit Java-equivalent recipes in the owning system package.",
            resourcePlan: "Static behavior, translations, geometry, and texture coverage are verified.",
            testPlan: "Existing focused Node suite plus source/build content-contract validation."
        };
    }
    if (entry.status === "blocked") {
        return {
            dependencies: ["S3-14 target-version decision"],
            deliveryPackage: "S3-14",
            assetPlan: "Defer assets until the target API decision is made.",
            lootPlan: "Classify after the target-version decision.",
            recipePlan: "Classify after the target-version decision.",
            resourcePlan: "No resource claim while the API blocker remains active.",
            testPlan: "Target-version compatibility test after the blocker is resolved."
        };
    }
    if (FOUNDATION_ACCEPTANCE_IDS.has(entry.acceptanceId)) {
        const ore = entry.javaIdentifier.endsWith("zinc_ore") || entry.javaIdentifier.endsWith("deepslate_zinc_ore");
        return {
            dependencies: ["Vanilla Bedrock crafting and loot-table formats"],
            deliveryPackage: "S3-8A",
            assetPlan: "Use the matching Java PNG as a build-time staged Bedrock texture.",
            lootPlan: ore
                ? "Explicit raw-zinc loot; silk-touch and fortune equivalence remain platform-test work."
                : "Explicit self-drop loot table.",
            recipePlan: entry.javaIdentifier.endsWith("raw_zinc_block")
                ? "Nine raw zinc pack into one raw zinc block; one raw zinc block unpacks into nine raw zinc."
                : entry.javaIdentifier.endsWith("weathered_iron_block")
                ? "One iron ingot at a stonecutter creates two weathered iron blocks."
                : "World generation is deferred; creative and explicit loot acquisition are available.",
            resourcePlan: "Full-cube block, creative-menu entry, EN/ZH names, terrain-atlas mapping, and explicit loot.",
            testPlan: "Foundation resource/recipe contract, source validation, build validation, and pack inspection."
        };
    }
    if (entry.domain === "content") {
        return {
            dependencies: ["S3-8A foundation materials"],
            deliveryPackage: "S3-8B",
            assetPlan: "Audit the Java model and texture before selecting a Bedrock representation.",
            lootPlan: "Classify self-drop, transformed drop, or machine-only acquisition from Java data.",
            recipePlan: "Classify vanilla-table, machine, or unsupported recipe path from Java data.",
            resourcePlan: "Do not claim assets until geometry, atlas, language, and creative access are specified.",
            testPlan: "Add a focused resource/recipe contract and persistence test where stateful."
        };
    }
	if (entry.domain === "redstone") {
		return {
			dependencies: ["S3-14 native redstone baseline", "Stable Bedrock 1.26.0 producer/consumer components"],
			deliveryPackage: "S3-14",
			assetPlan: "Implement a purpose-specific Bedrock block/item visual; do not register a placeholder output device.",
			lootPlan: "Classify destruction and retained-state behavior from the Java device before implementation.",
			recipePlan: "Classify vanilla-table, machine, or unsupported recipe path from Java data.",
			resourcePlan: REDSTONE_NATIVE_COMPONENT_BASELINE,
			testPlan: "Add native producer/consumer, positive, failure, restart, and concurrency coverage before changing matrix status."
		};
	}
    const deliveryPackage = DELIVERY_BY_DOMAIN.get(entry.domain) ?? "S3-8B";
    return {
        dependencies: ["S3-8A foundation materials", `${deliveryPackage} domain runtime`],
        deliveryPackage,
        assetPlan: "Audit the Java model and texture before selecting a Bedrock representation.",
        lootPlan: "Classify acquisition and destruction behavior from Java data.",
        recipePlan: "Classify vanilla-table, machine, or unsupported recipe path from Java data.",
        resourcePlan: "Do not claim assets until geometry, atlas, language, and creative access are specified.",
        testPlan: "Add positive, failure, restart, and concurrency coverage in the owning domain suite."
    };
}

const matrix = JSON.parse(await readFile(resolve(bedrockRoot, "data", "migration-matrix.json"), "utf8"));
validateMigrationMatrix(matrix);

const entries = matrix.entries
    .filter(entry => entry.phase === 3)
    .map(entry => ({
        acceptanceId: entry.acceptanceId,
        assetPlan: "",
        bedrockIdentifier: entry.bedrockIdentifier,
        blocker: entry.blockingReason,
        dependencies: [],
        deliveryPackage: "",
        domain: entry.domain,
        javaIdentifier: entry.javaIdentifier,
        kind: entry.kind,
        lootPlan: "",
        matrixStatus: entry.status,
        recipePlan: "",
        resourcePlan: "",
        testPlan: "",
        ...planFor(entry)
    }))
    .sort((left, right) => left.acceptanceId.localeCompare(right.acceptanceId));

const queue = {
    schemaVersion: STAGE3_WORK_QUEUE_SCHEMA_VERSION,
    generatedAt: "deterministic",
    generatedFrom: "bedrock/data/migration-matrix.json",
    supportingIdentifiers: [
        {
            identifier: "createbedrock:raw_zinc",
            purpose: "S3-8A ore drop and raw-zinc block recipe input."
        },
        {
            identifier: "createbedrock:zinc_ingot",
            purpose: "S3-8A furnace result and zinc-block recipe input."
        }
    ],
    entries
};

const coverage = validateStage3WorkQueue(queue, matrix);
await writeFile(resolve(bedrockRoot, "data", "stage3-work-queue.json"), `${JSON.stringify(queue, null, 2)}\n`);
console.log(`Wrote ${coverage.entries} Stage-3 work queue entries.`);
