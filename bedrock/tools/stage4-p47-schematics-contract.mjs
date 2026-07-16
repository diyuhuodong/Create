import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { SCHEMATIC_PLACEMENT_SCHEMA } from "../behavior_pack/scripts/schematics/schematic-state.js";
import { validateMigrationMatrix } from "./migration-matrix-schema.mjs";
import { stage4PackageFor, validateStage4WorkQueue } from "./stage4-work-queue-schema.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");
const defaultRepositoryRoot = resolve(defaultBedrockRoot, "..");
const P47_ACCEPTANCE_IDS = new Set([
	"SCHEMATICS-CLIPBOARD-BLOCK",
	"SCHEMATICS-CLIPBOARD-BLOCK_ENTITY",
	"SCHEMATICS-CRAFTING-BLUEPRINT-ENTITY",
	"SCHEMATICS-CRAFTING-BLUEPRINT-ITEM",
	"SCHEMATICS-EMPTY-SCHEMATIC-ITEM",
	"SCHEMATICS-SCHEMATIC-ITEM",
	"SCHEMATICS-SCHEMATIC-AND-QUILL-ITEM",
	"SCHEMATICS-SCHEMATIC-TABLE-BLOCK",
	"SCHEMATICS-SCHEMATIC-TABLE-BLOCK_ENTITY",
	"SCHEMATICS-SCHEMATICANNON-BLOCK",
	"SCHEMATICS-SCHEMATICANNON-BLOCK_ENTITY",
	"SCHEMATICS-WAND-OF-SYMMETRY-ITEM"
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

export async function validateStage4P47Schematics({
	bedrockRoot = defaultBedrockRoot,
	built = false,
	repositoryRoot = defaultRepositoryRoot,
	trackingRoot = defaultBedrockRoot
} = {}) {
	const [matrix, queue, english, chinese, runtime, state, clipboardRuntime, clipboardState, symmetryRuntime, symmetryState, terrain, items] = await Promise.all([
		readJson(resolve(trackingRoot, "data", "migration-matrix.json")),
		readJson(resolve(trackingRoot, "data", "stage4-work-queue.json")),
		readFile(resolve(bedrockRoot, "resource_pack", "texts", "en_US.lang"), "utf8"),
		readFile(resolve(bedrockRoot, "resource_pack", "texts", "zh_CN.lang"), "utf8"),
		readFile(resolve(bedrockRoot, "behavior_pack", "scripts", "schematics", "schematic-runtime.js"), "utf8"),
		readFile(resolve(bedrockRoot, "behavior_pack", "scripts", "schematics", "schematic-state.js"), "utf8"),
		readFile(resolve(bedrockRoot, "behavior_pack", "scripts", "schematics", "clipboard-runtime.js"), "utf8"),
		readFile(resolve(bedrockRoot, "behavior_pack", "scripts", "schematics", "clipboard-state.js"), "utf8"),
		readFile(resolve(bedrockRoot, "behavior_pack", "scripts", "schematics", "symmetry-runtime.js"), "utf8"),
		readFile(resolve(bedrockRoot, "behavior_pack", "scripts", "schematics", "symmetry-state.js"), "utf8"),
		readJson(resolve(bedrockRoot, "resource_pack", "textures", "terrain_texture.json")),
		readJson(resolve(bedrockRoot, "resource_pack", "textures", "item_texture.json"))
	]);
	validateMigrationMatrix(matrix);
	validateStage4WorkQueue(queue, matrix);
	const entries = matrix.entries.filter(entry => P47_ACCEPTANCE_IDS.has(entry.acceptanceId));
	if (entries.length !== P47_ACCEPTANCE_IDS.size
		|| entries.some(entry => entry.status !== "static_verified" || stage4PackageFor(entry) !== "P4.7" || ![1, 2].includes(entry.persistenceSchema)))
		throw new Error("P4.7 Schematic entries must be static-verified with a bounded persistence schema");
	for (const entry of entries) {
		const queued = queue.entries.find(candidate => candidate.acceptanceId === entry.acceptanceId);
		if (!queued || queued.deliveryPackage !== "completed:P4.7")
			throw new Error(`P4.7 queue entry ${entry.acceptanceId} must be completed`);
	}
	for (const required of [
		"SchematicPlacementController", "captureSchematicSelection", "MAX_ACTIVE_CANNONS",
		"placements.abort", "ShardedStateStore", "SCHEMATIC_ITEM_STATE_PROPERTY",
		"placement_header", "placement_chunk", "MAX_PERSISTED_OPERATION_CHARS", "snapshotSerialized"
	])
		if (!runtime.includes(required))
			throw new Error(`P4.7 Schematic runtime is missing ${required}`);
	for (const required of [
		"MAX_SCHEMATIC_BLOCKS", "createSchematicSnapshot", "Schematic snapshots may contain only Create Bedrock blocks",
		"#claims", "#advanceRollback", "target_changed_after_preflight", "write_intent", "commitPrepared"
	])
		if (!state.includes(required))
			throw new Error(`P4.7 Schematic transaction boundary is missing ${required}`);
	for (const required of ["CLIPBOARD_MAX_TEXT_LENGTH", "normalizeClipboardRecord"])
		if (!clipboardState.includes(required))
			throw new Error(`P4.7 Clipboard state is missing ${required}`);
	for (const required of ["ShardedStateStore", "ModalFormData", "createClipboardState"])
		if (!clipboardRuntime.includes(required))
			throw new Error(`P4.7 Clipboard runtime is missing ${required}`);
	for (const required of ["SYMMETRY_MAX_TARGETS", "resolveSymmetryTargets", "createSymmetryState"])
		if (!symmetryState.includes(required))
			throw new Error(`P4.7 Symmetry state is missing ${required}`);
	for (const required of ["ModalFormData", "resolveSymmetryTargets", "WAND_OF_SYMMETRY_ITEM"])
		if (!symmetryRuntime.includes(required))
			throw new Error(`P4.7 Symmetry runtime is missing ${required}`);
	for (const [identifier, geometry] of [
		["clipboard", "geometry.createbedrock.clipboard"],
		["schematic_table", "geometry.createbedrock.schematic_table"],
		["schematicannon", "geometry.createbedrock.schematicannon"]
	]) {
		const block = await readJson(resolve(bedrockRoot, "behavior_pack", "blocks", `${identifier}.json`));
		if (block["minecraft:block"]?.description?.identifier !== `createbedrock:${identifier}`
			|| block["minecraft:block"]?.components?.["minecraft:geometry"] !== geometry)
			throw new Error(`P4.7 ${identifier} block must retain its Bedrock identity and geometry`);
		const loot = await readJson(resolve(bedrockRoot, "behavior_pack", "loot_tables", "blocks", `${identifier}.json`));
		if (loot.pools?.[0]?.entries?.[0]?.name !== `createbedrock:${identifier}`)
			throw new Error(`P4.7 ${identifier} block must self-drop`);
		await requireFile(resolve(bedrockRoot, "behavior_pack", "recipes", `${identifier}.json`), `P4.7 ${identifier} recipe`);
	}
	for (const identifier of ["crafting_blueprint", "empty_schematic", "schematic", "schematic_and_quill", "wand_of_symmetry"])
		await requireFile(resolve(bedrockRoot, "behavior_pack", "items", `${identifier}.json`), `P4.7 ${identifier} item`);
	for (const identifier of ["crafting_blueprint", "empty_schematic", "schematic_and_quill", "wand_of_symmetry"])
		await requireFile(resolve(bedrockRoot, "behavior_pack", "recipes", `${identifier}.json`), `P4.7 ${identifier} recipe`);
	const entity = await readJson(resolve(bedrockRoot, "behavior_pack", "entities", "crafting_blueprint.json"));
	if (entity["minecraft:entity"]?.description?.identifier !== "createbedrock:crafting_blueprint")
		throw new Error("P4.7 Crafting Blueprint entity must retain its Bedrock identity");
	for (const [atlas, keys] of [
		[terrain.texture_data, ["createbedrock_clipboard_model_blank", "createbedrock_schematic_table_side", "createbedrock_schematicannon"]],
		[items.texture_data, ["createbedrock_crafting_blueprint", "createbedrock_empty_schematic", "createbedrock_schematic", "createbedrock_schematic_and_quill", "createbedrock_wand_of_symmetry"]]
	])
		for (const key of keys)
			if (!atlas?.[key])
				throw new Error(`P4.7 texture atlas is missing ${key}`);
	for (const key of [
		"tile.createbedrock:clipboard.name", "tile.createbedrock:schematic_table.name", "tile.createbedrock:schematicannon.name",
		"item.createbedrock:crafting_blueprint.name", "item.createbedrock:empty_schematic.name", "item.createbedrock:schematic.name",
		"item.createbedrock:schematic_and_quill.name", "item.createbedrock:wand_of_symmetry.name", "entity.createbedrock:crafting_blueprint.name"
	]) {
		requireLanguage(english.split(/\r?\n/), key);
		requireLanguage(chinese.split(/\r?\n/), key);
	}
	for (const source of [
		"src/generated/resources/data/create/recipe/crafting/appliances/clipboard.json",
		"src/generated/resources/data/create/recipe/crafting/appliances/crafting_blueprint.json",
		"src/generated/resources/data/create/recipe/crafting/schematics/empty_schematic.json",
		"src/generated/resources/data/create/recipe/crafting/schematics/schematic_and_quill.json",
		"src/generated/resources/data/create/recipe/crafting/schematics/schematic_table.json",
		"src/generated/resources/data/create/recipe/crafting/schematics/schematicannon.json",
		"src/generated/resources/data/create/recipe/mechanical_crafting/wand_of_symmetry.json",
		"src/generated/resources/data/create/loot_table/blocks/clipboard.json",
		"src/generated/resources/data/create/loot_table/blocks/schematic_table.json",
		"src/generated/resources/data/create/loot_table/blocks/schematicannon.json",
		"src/main/resources/assets/create/models/block/clipboard/block_empty.json",
		"src/main/resources/assets/create/models/block/schematic_table.json",
		"src/main/resources/assets/create/models/block/schematicannon/block.json",
		"src/main/resources/assets/create/models/entity/crafting_blueprint_small.json",
		"src/main/resources/assets/create/models/item/wand_of_symmetry/item.json",
		"src/main/resources/assets/create/textures/block/clipboard_model_blank.png",
		"src/main/resources/assets/create/textures/block/schematic_table_side.png",
		"src/main/resources/assets/create/textures/block/schematic_table_top.png",
		"src/main/resources/assets/create/textures/block/schematicannon.png",
		"src/main/resources/assets/create/textures/block/symmetry_mirror.png",
		"src/main/resources/assets/create/textures/entity/blueprint_small.png",
		"src/main/resources/assets/create/textures/item/crafting_blueprint.png",
		"src/main/resources/assets/create/textures/item/empty_schematic.png",
		"src/main/resources/assets/create/textures/item/schematic.png",
		"src/main/resources/assets/create/textures/item/schematic_and_quill.png"
	])
		await requireFile(resolve(repositoryRoot, source), `P4.7 Java source ${source}`);
	if (built) {
		for (const geometry of ["clipboard", "schematic_table", "schematicannon"])
			await requireFile(resolve(bedrockRoot, "resource_pack", "models", "blocks", `${geometry}.geo.json`), `Built P4.7 ${geometry} geometry`);
		for (const texture of ["clipboard_model_blank", "schematic_table_side", "schematic_table_top", "schematicannon", "symmetry_mirror"])
			await requireFile(resolve(bedrockRoot, "resource_pack", "textures", "create_java", "block", `${texture}.png`), `Built P4.7 ${texture} texture`);
		for (const texture of ["crafting_blueprint", "empty_schematic", "schematic", "schematic_and_quill"])
			await requireFile(resolve(bedrockRoot, "resource_pack", "textures", "create_java", "item", `${texture}.png`), `Built P4.7 ${texture} item texture`);
		await requireFile(resolve(bedrockRoot, "resource_pack", "textures", "create_java", "entity", "blueprint_small.png"), "Built P4.7 Blueprint texture");
	}
	return { blocks: 3, entries: entries.length, items: 5, maxBlocks: 512, placementSchema: SCHEMATIC_PLACEMENT_SCHEMA };
}
