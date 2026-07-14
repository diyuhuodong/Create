import { readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
    STAGE3_KINETIC_SPECIFICATION_SCHEMA_VERSION,
    validateStage3KineticSpecifications
} from "./stage3-kinetic-specification-schema.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(bedrockRoot, "..");

const IMPLEMENTED = new Set([
    "adjustable_chain_gearshift",
    "andesite_encased_cogwheel",
    "andesite_encased_large_cogwheel",
    "andesite_encased_shaft",
    "brass_encased_cogwheel",
    "brass_encased_large_cogwheel",
    "brass_encased_shaft",
    "creative_motor",
    "flywheel",
    "gearshift",
    "large_water_wheel",
    "metal_girder_encased_shaft",
    "chain_conveyor",
    "powered_shaft",
    "sequenced_gearshift",
    "steam_engine",
    "water_wheel_structure",
    "windmill_bearing"
]);

const RUNTIME_ABSORBED = new Set([
    "encased_cogwheel",
    "encased_large_cogwheel",
    "encased_shaft",
    "motor",
    "simple_kinetic",
    "vertical_gearbox"
]);

function profileFor(identifier) {
    if (IMPLEMENTED.has(identifier)) {
        return {
            behaviorBoundary: identifier === "chain_conveyor"
                ? "Implemented as a kinetic DepotNetwork belt with durable transport, reversal, break protection, and restart rescanning."
                : identifier === "steam_engine" || identifier === "powered_shaft"
                    ? "Implemented as a durable fluid-tank-to-powered-shaft bridge with bounded water consumption and zero-output fail-safe."
                    : identifier === "windmill_bearing"
                        ? "Implemented through the persistent contraption controller; assembled movable sail blocks generate bounded kinetic speed."
                        : identifier === "water_wheel_structure"
                            ? "Implemented as the automatically maintained eight-block large-water-wheel structural ring."
                            : identifier === "sequenced_gearshift"
                                ? "Implemented in KineticWorld with persistent bounded instruction steps and redstone edge start/stop semantics."
                                : "Implemented in KineticWorld with axis-aware propagation, durable source/control state, and the S3-9 block resource boundary.",
            deliveryState: "implemented",
            implementationPackage: "S3-9",
            resourceBoundary: identifier === "water_wheel_structure"
                ? "Internal generated structure block with EN/ZH diagnostics name; it is not exposed as a creative item."
                : "Placeable block, creative entry, self-drop, EN/ZH name, and a deliberately partial Java-asset geometry mapping.",
            testPlan: "Focused propagation, failure, restart, control-update, and source-contract tests cover this implementation."
        };
    }
    if (RUNTIME_ABSORBED.has(identifier)) {
        return {
            behaviorBoundary: "No independent Bedrock block-entity object is introduced; the state-free Java registration is represented by the concrete KineticWorld node implementations.",
            deliveryState: "runtime_absorbed",
            implementationPackage: "S3-9",
            resourceBoundary: "No separate placeable identifier is emitted because this record is an abstract Java runtime or an orientation alias.",
            testPlan: "Concrete variant propagation and persistence tests cover the shared runtime behavior."
        };
    }
    throw new Error(`S3-9 identifier ${identifier} has no delivery profile`);
}

async function ensureEvidence(paths) {
    for (const path of paths)
        await stat(resolve(repositoryRoot, path));
}

const workQueue = JSON.parse(await readFile(resolve(bedrockRoot, "data", "stage3-work-queue.json"), "utf8"));
const entries = workQueue.entries
    .filter(entry => entry.deliveryPackage === "S3-9")
    .map(entry => {
        const identifier = entry.javaIdentifier.slice("create:".length);
        const javaEvidencePaths = ["src/main/java/com/simibubi/create/AllBlocks.java"];
        if (entry.kind === "block_entity")
            javaEvidencePaths[0] = "src/main/java/com/simibubi/create/AllBlockEntityTypes.java";
        if (entry.kind === "item")
            javaEvidencePaths[0] = "src/main/java/com/simibubi/create/AllItems.java";
        return {
            acceptanceId: entry.acceptanceId,
            bedrockIdentifier: entry.bedrockIdentifier,
            ...profileFor(identifier),
            javaEvidencePaths,
            javaIdentifier: entry.javaIdentifier,
            kind: entry.kind
        };
    })
    .sort((left, right) => left.acceptanceId.localeCompare(right.acceptanceId));

await Promise.all(entries.map(entry => ensureEvidence(entry.javaEvidencePaths)));
const specifications = {
    schemaVersion: STAGE3_KINETIC_SPECIFICATION_SCHEMA_VERSION,
    generatedAt: "deterministic",
    generatedFrom: "bedrock/data/stage3-work-queue.json and Java registration sources",
    entries
};
const coverage = validateStage3KineticSpecifications(specifications, workQueue);
await writeFile(resolve(bedrockRoot, "data", "stage3-kinetic-specifications.json"), `${JSON.stringify(specifications, null, 2)}\n`);
console.log(`Wrote ${coverage.entries} S3-9 kinetic specifications.`);
