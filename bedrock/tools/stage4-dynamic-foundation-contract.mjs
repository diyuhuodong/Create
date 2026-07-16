import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { collectConnectedBlocks } from "../behavior_pack/scripts/contraptions/assembly-collector.js";
import { MAX_DYNAMIC_ASSEMBLY_BLOCKS, createDynamicAssemblySnapshot, normalizeDynamicAssemblySnapshot } from "../behavior_pack/scripts/contraptions/dynamic-assembly-snapshot.js";
import { validateMigrationMatrix } from "./migration-matrix-schema.mjs";
import { validateStage4WorkQueue } from "./stage4-work-queue-schema.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");
const FOUNDATION_SOURCES = [
	"behavior_pack/scripts/contraptions/assembly-collector.js",
	"behavior_pack/scripts/contraptions/assembly-transform.js",
	"behavior_pack/scripts/contraptions/dynamic-assembly-collision.js",
	"behavior_pack/scripts/contraptions/dynamic-assembly-controller.js",
	"behavior_pack/scripts/contraptions/dynamic-assembly-snapshot.js",
	"behavior_pack/scripts/contraptions/dynamic-assembly-world-port.js",
	"behavior_pack/scripts/contraptions/elevator-column.js",
	"behavior_pack/scripts/contraptions/motion-contact.js",
	"behavior_pack/scripts/contraptions/moving-block-data.js"
];

async function readJson(file) {
	try {
		return JSON.parse(await readFile(file, "utf8"));
	} catch (error) {
		throw new Error(`Invalid JSON in ${file}: ${error.message}`);
	}
}

export async function validateStage4DynamicFoundation({ bedrockRoot = defaultBedrockRoot } = {}) {
	const [matrix, queue] = await Promise.all([
		readJson(resolve(bedrockRoot, "data", "migration-matrix.json")),
		readJson(resolve(bedrockRoot, "data", "stage4-work-queue.json"))
	]);
	validateMigrationMatrix(matrix);
	const workQueue = validateStage4WorkQueue(queue, matrix);
	if (MAX_DYNAMIC_ASSEMBLY_BLOCKS !== 512)
		throw new Error(`Stage-4 dynamic assemblies must support 512 blocks, found ${MAX_DYNAMIC_ASSEMBLY_BLOCKS}`);
	const blocks = Array.from({ length: MAX_DYNAMIC_ASSEMBLY_BLOCKS }, (_, x) => ({
		location: { x, y: 64, z: 0 },
		typeId: "createbedrock:andesite_casing"
	}));
	const snapshot = createDynamicAssemblySnapshot({ anchor: blocks[0].location, blocks });
	if (normalizeDynamicAssemblySnapshot(snapshot).blocks.length !== MAX_DYNAMIC_ASSEMBLY_BLOCKS)
		throw new Error("Stage-4 dynamic assembly snapshot did not preserve the full safety budget");
	const world = new Map(blocks.map(block => [`${block.location.x}:${block.location.y}:${block.location.z}`, { typeId: block.typeId }]));
	const collected = collectConnectedBlocks({
		start: blocks[0].location,
		readBlock(location) {
			return world.get(`${location.x}:${location.y}:${location.z}`);
		}
	});
	if (collected.length !== MAX_DYNAMIC_ASSEMBLY_BLOCKS)
		throw new Error("Stage-4 collector retained a legacy contraption size limit");
	for (const source of FOUNDATION_SOURCES) {
		try {
			if (!(await stat(resolve(bedrockRoot, source))).isFile())
				throw new Error("not a file");
		} catch (error) {
			throw new Error(`Stage-4 dynamic foundation source is missing: ${source} (${error.message})`);
		}
	}
	return { dynamicBlocks: MAX_DYNAMIC_ASSEMBLY_BLOCKS, entries: workQueue.entries, sources: FOUNDATION_SOURCES.length };
}
