import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateMigrationMatrix } from "./migration-matrix-schema.mjs";
import { stage4PackageFor, validateStage4WorkQueue } from "./stage4-work-queue-schema.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");
const defaultRepositoryRoot = resolve(defaultBedrockRoot, "..");
const P46_ACCEPTANCE_IDS = new Set([
	"CONTRAPTIONS-STICKER-BLOCK",
	"CONTRAPTIONS-STICKER-BLOCK_ENTITY"
]);

async function readJson(file) {
	try {
		return JSON.parse(await readFile(file, "utf8"));
	} catch (error) {
		throw new Error(`Invalid JSON in ${file}: ${error.message}`);
	}
}

async function requireFile(file, label) {
	try {
		if (!(await stat(file)).isFile())
			throw new Error("not a file");
	} catch (error) {
		throw new Error(`${label} is missing: ${file} (${error.message})`);
	}
}

function requireLanguage(lines, key) {
	if (!lines.some(line => line.startsWith(`${key}=`)))
		throw new Error(`Missing language key ${key}`);
}

export async function validateStage4P46Stickers({
	bedrockRoot = defaultBedrockRoot,
	built = false,
	repositoryRoot = defaultRepositoryRoot,
	trackingRoot = defaultBedrockRoot
} = {}) {
	const [matrix, queue, english, chinese, runtime, state, attachments, movable, kinetic, controller] = await Promise.all([
		readJson(resolve(trackingRoot, "data", "migration-matrix.json")),
		readJson(resolve(trackingRoot, "data", "stage4-work-queue.json")),
		readFile(resolve(bedrockRoot, "resource_pack", "texts", "en_US.lang"), "utf8"),
		readFile(resolve(bedrockRoot, "resource_pack", "texts", "zh_CN.lang"), "utf8"),
		readFile(resolve(bedrockRoot, "behavior_pack", "scripts", "contraptions", "sticker-runtime.js"), "utf8"),
		readFile(resolve(bedrockRoot, "behavior_pack", "scripts", "contraptions", "sticker-state.js"), "utf8"),
		readFile(resolve(bedrockRoot, "behavior_pack", "scripts", "contraptions", "assembly-attachments.js"), "utf8"),
		readFile(resolve(bedrockRoot, "behavior_pack", "scripts", "contraptions", "movable-blocks.js"), "utf8"),
		readFile(resolve(bedrockRoot, "behavior_pack", "scripts", "kinetics", "kinetic-world.js"), "utf8"),
		readFile(resolve(bedrockRoot, "behavior_pack", "scripts", "contraptions", "dynamic-assembly-controller.js"), "utf8")
	]);
	validateMigrationMatrix(matrix);
	validateStage4WorkQueue(queue, matrix);
	const entries = matrix.entries.filter(entry => P46_ACCEPTANCE_IDS.has(entry.acceptanceId));
	if (entries.length !== P46_ACCEPTANCE_IDS.size
		|| entries.some(entry => entry.status !== "static_verified" || stage4PackageFor(entry) !== "P4.6" || entry.persistenceSchema !== 2))
		throw new Error("P4.6 Sticker entries must be static-verified with moving-data persistence");
	for (const entry of entries) {
		const queued = queue.entries.find(candidate => candidate.acceptanceId === entry.acceptanceId);
		if (!queued || queued.deliveryPackage !== "completed:P4.6")
			throw new Error(`P4.6 queue entry ${entry.acceptanceId} must be completed`);
	}
	for (const required of [
		"registerMovingBlockDataContributor(STICKER_BLOCK, \"sticker\"",
		"stickerLinkedLocationsForAssembly",
		"ShardedStateStore",
		"setActive(event.block, !state.active)"
	])
		if (!runtime.includes(required))
			throw new Error(`P4.6 Sticker runtime is missing ${required}`);
	for (const required of ["#claimedSources", "is already owned by"])
		if (!controller.includes(required))
			throw new Error(`P4.6 Sticker source ownership is missing ${required}`);
	for (const required of ["createStickerState", "stickerAttachmentTarget", "mergeAssemblyAttachmentLocations", "normalizeStickerRecord"])
		if (!state.includes(required))
			throw new Error(`P4.6 Sticker state boundary is missing ${required}`);
	for (const required of ["gluedLocationsForAssembly", "chassisLinkedLocationsForAssembly", "stickerLinkedLocationsForAssembly", "mergeAssemblyAttachmentLocations"])
		if (!attachments.includes(required))
			throw new Error(`P4.6 unified assembly attachment graph is missing ${required}`);
	const block = await readJson(resolve(bedrockRoot, "behavior_pack", "blocks", "sticker.json"));
	if (block["minecraft:block"]?.description?.identifier !== "createbedrock:sticker"
		|| !Array.isArray(block["minecraft:block"]?.description?.properties?.["createbedrock:active"]))
		throw new Error("P4.6 Sticker block must retain identity and active state");
	if (!movable.includes('"createbedrock:sticker"') || !kinetic.includes('"createbedrock:sticker"'))
		throw new Error("P4.6 Sticker must be movable and kinetically registered");
	const loot = await readJson(resolve(bedrockRoot, "behavior_pack", "loot_tables", "blocks", "sticker.json"));
	if (loot.pools?.[0]?.entries?.[0]?.name !== "createbedrock:sticker")
		throw new Error("P4.6 Sticker must self-drop");
	await requireFile(resolve(bedrockRoot, "behavior_pack", "recipes", "sticker.json"), "P4.6 Sticker recipe");
	requireLanguage(english.split(/\r?\n/), "tile.createbedrock:sticker.name");
	requireLanguage(chinese.split(/\r?\n/), "tile.createbedrock:sticker.name");
	for (const source of [
		"src/generated/resources/data/create/recipe/crafting/kinetics/sticker.json",
		"src/generated/resources/data/create/loot_table/blocks/sticker.json",
		"src/main/resources/assets/create/models/block/sticker/block.json",
		"src/main/resources/assets/create/models/block/sticker/block_powered.json",
		"src/main/resources/assets/create/models/block/sticker/head.json",
		"src/main/resources/assets/create/textures/block/sticker.png",
		"src/main/resources/assets/create/textures/block/sticker_side.png",
		"src/main/resources/assets/create/textures/block/sticker_side_powered.png"
	])
		await requireFile(resolve(repositoryRoot, source), `P4.6 Java source ${source}`);
	if (built) {
		await requireFile(resolve(bedrockRoot, "resource_pack", "models", "blocks", "sticker.geo.json"), "Built P4.6 Sticker geometry");
		for (const texture of ["sticker", "sticker_side", "sticker_side_powered"])
			await requireFile(resolve(bedrockRoot, "resource_pack", "textures", "create_java", "block", `${texture}.png`), `Built P4.6 ${texture} texture`);
	}
	return { attachmentProviders: 3, blocks: 1, entries: entries.length, persistenceSchema: 2 };
}
