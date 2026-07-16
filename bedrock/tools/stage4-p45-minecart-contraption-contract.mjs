import { constants } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateMigrationMatrix } from "./migration-matrix-schema.mjs";
import { stage4PackageFor, validateStage4WorkQueue } from "./stage4-work-queue-schema.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");
const defaultRepositoryRoot = resolve(defaultBedrockRoot, "..");
const P45_ACCEPTANCE_IDS = new Set([
	"CONTRAPTIONS-CARRIAGE-CONTRAPTION-ENTITY",
	"CONTRAPTIONS-CART-ASSEMBLER-BLOCK",
	"CONTRAPTIONS-CART-ASSEMBLER-BLOCK_ENTITY",
	"CONTRAPTIONS-CHEST-MINECART-CONTRAPTION-ITEM",
	"CONTRAPTIONS-FURNACE-MINECART-CONTRAPTION-ITEM",
	"CONTRAPTIONS-MINECART-ANCHOR-BLOCK",
	"CONTRAPTIONS-MINECART-CONTRAPTION-ITEM",
	"CONTRAPTIONS-MINECART-COUPLING-ITEM",
	"CONTRAPTIONS-SEAT-ENTITY"
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

async function isAbsent(file) {
	try {
		await access(file, constants.F_OK);
		return false;
	} catch {
		return true;
	}
}

function requireLanguage(lines, key) {
	if (!lines.some(line => line.startsWith(`${key}=`)))
		throw new Error(`Missing language key ${key}`);
}

export async function validateStage4P45MinecartContraptions({
	bedrockRoot = defaultBedrockRoot,
	built = false,
	repositoryRoot = defaultRepositoryRoot,
	trackingRoot = defaultBedrockRoot
} = {}) {
	const [matrix, queue, english, chinese, runtime, state, worldPort] = await Promise.all([
		readJson(resolve(trackingRoot, "data", "migration-matrix.json")),
		readJson(resolve(trackingRoot, "data", "stage4-work-queue.json")),
		readFile(resolve(bedrockRoot, "resource_pack", "texts", "en_US.lang"), "utf8"),
		readFile(resolve(bedrockRoot, "resource_pack", "texts", "zh_CN.lang"), "utf8"),
		readFile(resolve(bedrockRoot, "behavior_pack", "scripts", "trains", "minecart-contraption-runtime.js"), "utf8"),
		readFile(resolve(bedrockRoot, "behavior_pack", "scripts", "trains", "minecart-contraption-state.js"), "utf8"),
		readFile(resolve(bedrockRoot, "behavior_pack", "scripts", "contraptions", "dynamic-assembly-world-port.js"), "utf8")
	]);
	validateMigrationMatrix(matrix);
	validateStage4WorkQueue(queue, matrix);
	const entries = matrix.entries.filter(entry => P45_ACCEPTANCE_IDS.has(entry.acceptanceId));
	if (entries.length !== P45_ACCEPTANCE_IDS.size
		|| entries.some(entry => entry.status !== "static_verified" || stage4PackageFor(entry) !== "P4.5" || entry.persistenceSchema !== 2))
		throw new Error("P4.5 acceptance entries must be static-verified with shared dynamic assembly persistence");
	for (const entry of entries) {
		const queued = queue.entries.find(candidate => candidate.acceptanceId === entry.acceptanceId);
		if (!queued || queued.deliveryPackage !== "completed:P4.5")
			throw new Error(`P4.5 queue entry ${entry.acceptanceId} must be completed`);
	}
	for (const required of [
		"registerDynamicAssemblyOwnerRestorer(MINECART_CONTRAPTION_OWNER_KIND, restoreOwner)",
		"assembleExternalDynamicAssembly({",
		"disassembleExternalDynamicAssembly(disassembling.dimensionId, disassembling.assemblyId)",
		"MINECART_COUPLING_ITEM",
		"SEAT_ENTITY",
		"routeReservations"
	])
		if (!runtime.includes(required))
			throw new Error(`P4.5 minecart runtime is missing ${required}`);
	for (const required of ["MinecartContraptionRegistry", "couple(leftCartId, rightCartId)", "completeDisassembly(cartId)", "passengers", "route"])
		if (!state.includes(required))
			throw new Error(`P4.5 minecart ownership state is missing ${required}`);
	if (!worldPort.includes("CARRIAGE_CONTRAPTION_ENTITY") || !worldPort.includes('owner?.kind === "minecart_contraption"'))
		throw new Error("P4.5 carriage projection must be selected by dynamic assembly ownership");
	for (const identifier of ["cart_assembler", "minecart_anchor"]) {
		const block = await readJson(resolve(bedrockRoot, "behavior_pack", "blocks", `${identifier}.json`));
		if (block["minecraft:block"]?.description?.identifier !== `createbedrock:${identifier}`)
			throw new Error(`P4.5 block ${identifier} has an invalid identifier`);
		requireLanguage(english.split(/\r?\n/), `tile.createbedrock:${identifier}.name`);
		requireLanguage(chinese.split(/\r?\n/), `tile.createbedrock:${identifier}.name`);
		await requireFile(resolve(bedrockRoot, "behavior_pack", "loot_tables", "blocks", `${identifier}.json`), `P4.5 ${identifier} loot`);
	}
	for (const identifier of ["minecart_contraption", "chest_minecart_contraption", "furnace_minecart_contraption", "minecart_coupling"]) {
		const item = await readJson(resolve(bedrockRoot, "behavior_pack", "items", `${identifier}.json`));
		if (item["minecraft:item"]?.description?.identifier !== `createbedrock:${identifier}`)
			throw new Error(`P4.5 item ${identifier} has an invalid identifier`);
		requireLanguage(english.split(/\r?\n/), `item.createbedrock:${identifier}.name`);
		requireLanguage(chinese.split(/\r?\n/), `item.createbedrock:${identifier}.name`);
	}
	for (const identifier of ["carriage_contraption", "seat"]) {
		const entity = await readJson(resolve(bedrockRoot, "behavior_pack", "entities", `${identifier}.json`));
		const client = await readJson(resolve(bedrockRoot, "resource_pack", "entity", `${identifier}.entity.json`));
		if (entity["minecraft:entity"]?.description?.identifier !== `createbedrock:${identifier}`
			|| client["minecraft:client_entity"]?.description?.identifier !== `createbedrock:${identifier}`)
			throw new Error(`P4.5 ${identifier} requires matched BP/RP entity definitions`);
		requireLanguage(english.split(/\r?\n/), `entity.createbedrock:${identifier}.name`);
		requireLanguage(chinese.split(/\r?\n/), `entity.createbedrock:${identifier}.name`);
	}
	await requireFile(resolve(bedrockRoot, "behavior_pack", "recipes", "cart_assembler.json"), "P4.5 Cart Assembler recipe");
	await requireFile(resolve(bedrockRoot, "behavior_pack", "recipes", "minecart_coupling.json"), "P4.5 Minecart Coupling recipe");
	for (const identifier of ["minecart_contraption", "chest_minecart_contraption", "furnace_minecart_contraption"])
		if (!await isAbsent(resolve(bedrockRoot, "behavior_pack", "recipes", `${identifier}.json`)))
			throw new Error(`P4.5 ${identifier} must not invent an unsupported survival recipe`);
	for (const source of [
		"src/generated/resources/data/create/recipe/crafting/kinetics/cart_assembler.json",
		"src/generated/resources/data/create/recipe/crafting/curiosities/minecart_coupling.json",
		"src/main/resources/assets/create/models/block/cart_assembler/block.json",
		"src/main/resources/assets/create/models/block/cart_assembler/minecart_anchor.json",
		"src/main/resources/assets/create/textures/item/minecart_contraption.png",
		"src/main/resources/assets/create/textures/item/chest_minecart_contraption.png",
		"src/main/resources/assets/create/textures/item/furnace_minecart_contraption.png",
		"src/main/resources/assets/create/textures/item/minecart_coupling.png"
	])
		await requireFile(resolve(repositoryRoot, source), `P4.5 Java source ${source}`);
	if (built) {
		for (const geometry of ["cart_assembler", "minecart_anchor"])
			await requireFile(resolve(bedrockRoot, "resource_pack", "models", "blocks", `${geometry}.geo.json`), `Built P4.5 ${geometry} geometry`);
		for (const texture of ["minecart_contraption", "chest_minecart_contraption", "furnace_minecart_contraption", "minecart_coupling"])
			await requireFile(resolve(bedrockRoot, "resource_pack", "textures", "create_java", "item", `${texture}.png`), `Built P4.5 ${texture} texture`);
	}
	return { blocks: 2, entries: entries.length, entities: 2, items: 4, recipes: 2 };
}
