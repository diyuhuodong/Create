import { readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
	STAGE3_PROCESSING_SPECIFICATION_SCHEMA_VERSION,
	validateStage3ProcessingSpecifications
} from "./stage3-processing-specification-schema.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(bedrockRoot, "..");

const BLOCK_MODELS = new Map([
	["basin", "src/main/resources/assets/create/models/block/basin/block.json"],
	["encased_fan", "src/main/resources/assets/create/models/block/encased_fan/block.json"],
	["mechanical_mixer", "src/main/resources/assets/create/models/block/mechanical_mixer/block.json"],
	["mechanical_saw", "src/main/resources/assets/create/models/block/mechanical_saw/horizontal.json"]
]);

function profileFor(entry) {
	if (entry.kind === "block_entity") {
		return {
			behaviorBoundary: "The Java block-entity state is represented by one world-persisted BatchProcessingMachine record with managed item ports, fixed random decisions, break protection, and shard recovery; no unsafe custom Bedrock block entity is emitted.",
			deliveryState: "runtime_absorbed",
			implementationPackage: "S3-11",
			recipeBoundary: "The shared runtime consumes only recipes classified as migrated in the generated S3-11 import reports; every fluid, compatibility, unregistered-item, or runtime-registry source remains explicitly recorded as blocked/manual.",
			resourceBoundary: "This Java block-entity registration shares the corresponding placeable block and has no duplicate Bedrock resource identifier.",
			testPlan: "Batch matching, failed controller selection, restart-safe chance output, output escrow, report coverage, and source-contract tests exercise the shared runtime."
		};
	}
	const identifier = entry.javaIdentifier.slice("create:".length);
	const recipeBoundary = identifier === "basin" || identifier === "mechanical_mixer"
		? "Basin mixing and compacting recipes are imported only when all item inputs and outputs are represented by managed item ports; heat, fluid, and unavailable-item recipes remain classified in basin-import-report.json."
		: identifier === "mechanical_saw"
			? "Mechanical Saw runs the migrated static cutting recipes; compatibility recipes remain explicit unsupported dependencies in cutting-import-report.json."
			: "Encased Fan runs migrated haunting and splashing recipes against a fixed catalyst block. Blasting and smoking remain manual because their Java inputs come from a runtime recipe registry not exported in this repository.";
	return {
		behaviorBoundary: identifier === "basin"
			? "A durable multi-input Basin exposes managed item ports and advances only when a kinetic Mechanical Mixer or Mechanical Press is immediately above it."
			: identifier === "mechanical_mixer"
				? "A kinetic Mechanical Mixer acts as the Basin mixing controller and advances its lower Basin through the shared persistent runtime."
				: identifier === "mechanical_saw"
					? "A kinetic Mechanical Saw runs fixed cutting batches through the shared durable item-port runtime."
					: "A kinetic Encased Fan runs fixed haunting/splashing batches when the flow side selected by its facing and rotation direction contains the corresponding catalyst block.",
		deliveryState: "implemented",
		implementationPackage: "S3-11",
		recipeBoundary,
		resourceBoundary: "Placeable block with Java-model conversion, build-staged Java PNGs, creative access, explicit self-drop, EN/ZH translation, and terrain-atlas mapping. Facing visual animation remains platform acceptance work.",
		testPlan: "Focused batch-machine positive, failure, restart, and escrow tests plus recipe-report, source-contract, validation, build, and package tests cover this implementation."
	};
}

async function ensureEvidence(paths) {
	for (const path of paths)
		await stat(resolve(repositoryRoot, path));
}

const workQueue = JSON.parse(await readFile(resolve(bedrockRoot, "data", "stage3-work-queue.json"), "utf8"));
const entries = workQueue.entries
	.filter(entry => entry.deliveryPackage === "S3-11")
	.map(entry => {
		const identifier = entry.javaIdentifier.slice("create:".length);
		const javaEvidencePaths = entry.kind === "block_entity"
			? ["src/main/java/com/simibubi/create/AllBlockEntityTypes.java"]
			: ["src/main/java/com/simibubi/create/AllBlocks.java", BLOCK_MODELS.get(identifier)];
		return {
			acceptanceId: entry.acceptanceId,
			bedrockIdentifier: entry.bedrockIdentifier,
			...profileFor(entry),
			javaEvidencePaths,
			javaIdentifier: entry.javaIdentifier,
			kind: entry.kind
		};
	})
	.sort((left, right) => left.acceptanceId.localeCompare(right.acceptanceId));

await Promise.all(entries.map(entry => ensureEvidence(entry.javaEvidencePaths)));
const specifications = {
	schemaVersion: STAGE3_PROCESSING_SPECIFICATION_SCHEMA_VERSION,
	generatedAt: "deterministic",
	generatedFrom: "bedrock/data/stage3-work-queue.json and Java registration/model sources",
	entries
};
const coverage = validateStage3ProcessingSpecifications(specifications, workQueue);
await writeFile(resolve(bedrockRoot, "data", "stage3-processing-specifications.json"), `${JSON.stringify(specifications, null, 2)}\n`);
console.log(`Wrote ${coverage.entries} S3-11 processing specifications.`);
