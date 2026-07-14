import { readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
	STAGE3_LOGISTICS_SPECIFICATION_SCHEMA_VERSION,
	validateStage3LogisticsSpecifications
} from "./stage3-logistics-specification-schema.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(bedrockRoot, "..");

function profileFor(entry) {
	if (entry.kind === "block_entity") {
		return {
			behaviorBoundary: "The Java block-entity state is represented by DepotNetwork's world-persisted port, transfer journal, and device records; no unsafe custom Bedrock block entity is emitted.",
			deliveryState: "runtime_absorbed",
			implementationPackage: "S3-10",
			resourceBoundary: "This registration shares the corresponding placeable block and has no duplicate Bedrock resource identifier.",
			testPlan: "Durable transfer, restart, break-protection, and source-contract tests exercise the shared runtime."
		};
	}
	const identifier = entry.javaIdentifier.slice("create:".length);
	return {
		behaviorBoundary: identifier === "belt"
			? "Implemented as an axis-aware kinetic DepotNetwork belt with persisted in-flight transport, reversal, restart rescanning, and break protection."
			: identifier === "creative_crate"
				? "Implemented as a revisioned non-consuming CreativeItemPort that participates in the same durable transfer journal as normal ports."
				: identifier === "filter" || identifier === "attribute_filter"
					? "Implemented as configuration resources for durable allow-list device filters. The safe Bedrock item codec intentionally does not infer Java NBT or attribute predicates from live ItemStacks."
					: "Implemented by DepotNetwork's durable item-port and directed device-transfer runtime, including restart-safe intents and delivery retry.",
		deliveryState: "implemented",
		implementationPackage: "S3-10",
		resourceBoundary: entry.kind === "item"
			? "Creative-menu item with imported Java icon, EN/ZH name, and no standalone block resource."
			: "Placeable block with creative access, explicit self-drop, EN/ZH name, and a documented Java-asset or fixed-geometry resource mapping.",
		testPlan: "Focused port, filter, transport, restart, resource-contract, validation, build, and package tests cover this implementation."
	};
}

async function ensureEvidence(paths) {
	for (const path of paths)
		await stat(resolve(repositoryRoot, path));
}

const workQueue = JSON.parse(await readFile(resolve(bedrockRoot, "data", "stage3-work-queue.json"), "utf8"));
const entries = workQueue.entries
	.filter(entry => entry.deliveryPackage === "S3-10")
	.map(entry => {
		const javaEvidencePaths = [entry.kind === "block_entity"
			? "src/main/java/com/simibubi/create/AllBlockEntityTypes.java"
			: entry.kind === "item"
				? "src/main/java/com/simibubi/create/AllItems.java"
				: "src/main/java/com/simibubi/create/AllBlocks.java"];
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
	schemaVersion: STAGE3_LOGISTICS_SPECIFICATION_SCHEMA_VERSION,
	generatedAt: "deterministic",
	generatedFrom: "bedrock/data/stage3-work-queue.json and Java registration sources",
	entries
};
const coverage = validateStage3LogisticsSpecifications(specifications, workQueue);
await writeFile(resolve(bedrockRoot, "data", "stage3-logistics-specifications.json"), `${JSON.stringify(specifications, null, 2)}\n`);
console.log(`Wrote ${coverage.entries} S3-10 logistics specifications.`);
