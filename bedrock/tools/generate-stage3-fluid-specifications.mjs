import { readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
	STAGE3_FLUID_SPECIFICATION_SCHEMA_VERSION,
	validateStage3FluidSpecifications
} from "./stage3-fluid-specification-schema.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(bedrockRoot, "..");

const BLOCK_MODELS = new Map([
	["copper_valve_handle", "src/main/resources/assets/create/models/block/valve_handle.json"],
	["creative_fluid_tank", "src/main/resources/assets/create/models/block/fluid_tank/block_single.json"],
	["encased_fluid_pipe", "src/main/resources/assets/create/models/block/encased_fluid_pipe/block_open.json"],
	["fluid_valve", "src/main/resources/assets/create/models/block/fluid_valve/item.json"],
	["glass_fluid_pipe", "src/main/resources/assets/create/models/block/fluid_pipe/window.json"],
	["item_drain", "src/main/resources/assets/create/models/block/item_drain.json"],
	["portable_fluid_interface", "src/main/resources/assets/create/models/block/portable_fluid_interface/block.json"],
	["smart_fluid_pipe", "src/main/resources/assets/create/models/block/smart_fluid_pipe/item.json"],
	["spout", "src/main/resources/assets/create/models/block/spout/item.json"]
]);

function profileFor(entry) {
	if (entry.kind === "block_entity") {
		return {
			behaviorBoundary: "The Java block-entity registration is represented by the world-persisted FluidNetworkState, transactional FluidNetwork links, and endpoint descriptors; no unsafe custom Bedrock block entity is emitted.",
			deliveryState: "runtime_absorbed",
			implementationPackage: "S3-12",
			resourceBoundary: "This Java block entity shares the paired placeable block and durable fluid runtime. The valve-handle entity is absorbed by createbedrock:copper_valve_handle.",
			testPlan: "Filter, valve, creative-source, capacity conservation, branch competition, restart, source-contract, validation, build, and package tests exercise the shared runtime."
		};
	}
	const identifier = entry.javaIdentifier.slice("create:".length);
	const behaviorBoundary = identifier === "creative_fluid_tank"
		? "Creative Fluid Tank registers an inexhaustible, selected water/lava source through CreativeFluidPort. Its descriptor is persisted and selection changes invalidate incompatible in-flight reservations safely."
		: identifier === "fluid_valve"
			? "Fluid Valve is a pipe-run member whose open state gates both directional journal links. Empty-hand use toggles the durable link state; a Copper Valve Handle can toggle an adjacent valve."
			: identifier === "smart_fluid_pipe"
				? "Smart Fluid Pipe contributes an any/water/lava filter to its straight run before a source reservation is created, preserving transfer capacity and preventing wrong-fluid extraction."
				: identifier === "item_drain"
					? "Item Drain exposes a 1,000 mB persisted endpoint that accepts a filled water or lava bucket through the standard compensated bucket transaction."
					: identifier === "spout"
						? "Spout exposes a 1,000 mB persisted endpoint that fills an empty bucket through the standard compensated bucket transaction."
						: identifier === "portable_fluid_interface"
							? "Portable Fluid Interface exposes a 1,000 mB local persisted endpoint for pipe and bucket exchange; contraption attachment is deferred to the later moving-contraption delivery."
							: "This pipe variant participates in the shared straight-run FluidNetwork topology and persistent transactional transfer journal.";
	return {
		behaviorBoundary,
		deliveryState: "implemented",
		implementationPackage: "S3-12",
		resourceBoundary: identifier === "creative_fluid_tank"
			? "Creative-only source with explicit self-drop, EN/ZH translation, staged Java PNGs, and terrain-atlas mapping. It intentionally has no survival crafting recipe."
			: identifier === "copper_valve_handle"
				? "Placeable block with creative access, explicit self-drop, EN/ZH translation, and a hand-crank geometry fallback because the source Valve Handle model is a NeoForge OBJ not accepted by the JSON converter. Its direct Bedrock crafting-table recipe uses only vanilla survival inputs."
				: "Placeable block with Java-model conversion, staged Java PNGs, creative access, explicit Java-equivalent drop, EN/ZH translation, and terrain-atlas mapping. Its direct Bedrock crafting-table recipe uses only vanilla survival inputs; platform visual parity remains an acceptance test.",
		testPlan: "Focused positive, failure, restart, and branch-contention fluid tests plus source-contract, validation, build, and package checks cover this implementation."
	};
}

async function ensureEvidence(paths) {
	for (const path of paths)
		await stat(resolve(repositoryRoot, path));
}

const workQueue = JSON.parse(await readFile(resolve(bedrockRoot, "data", "stage3-work-queue.json"), "utf8"));
const entries = workQueue.entries
	.filter(entry => ["S3-12", "completed:S3-12"].includes(entry.deliveryPackage))
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
	schemaVersion: STAGE3_FLUID_SPECIFICATION_SCHEMA_VERSION,
	generatedAt: "deterministic",
	generatedFrom: "bedrock/data/stage3-work-queue.json and Java registration/model sources",
	entries
};
const coverage = validateStage3FluidSpecifications(specifications, workQueue);
await writeFile(resolve(bedrockRoot, "data", "stage3-fluid-specifications.json"), `${JSON.stringify(specifications, null, 2)}\n`);
console.log(`Wrote ${coverage.entries} S3-12 fluid specifications.`);
