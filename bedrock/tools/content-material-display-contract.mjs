import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { plannedGeometryIdentifiers } from "./convert-java-models.mjs";
import { JAVA_BLOCK_TEXTURES } from "./import-java-assets.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(defaultBedrockRoot, "..");

const DISPLAY_TEXTURES = [
	["createbedrock_dark_metal_block", "dark_metal_block.png"],
	["createbedrock_flap_display_front", "flap_display_front.png"],
	["createbedrock_flap_display_inside", "flap_display_inside.png"],
	["createbedrock_flap_display_side", "flap_display_side.png"],
	["createbedrock_flap_display_top", "flap_display_top.png"],
	["createbedrock_placard", "placard.png"],
	["createbedrock_stock_ticker", "stock_ticker.png"]
];

async function readJson(file) {
	try {
		return JSON.parse(await readFile(file, "utf8"));
	} catch (error) {
		throw new Error(`Invalid JSON in ${file}: ${error.message}`);
	}
}

async function fileExists(file) {
	try {
		return (await stat(file)).isFile();
	} catch {
		return false;
	}
}

function languageKeys(contents) {
	return new Set(contents.split(/\r?\n/)
		.map(line => line.indexOf("=") === -1 ? "" : line.slice(0, line.indexOf("=")))
		.filter(Boolean));
}

/** Static contract for the C2-B interactive display/logistics package. */
export async function validateContentMaterialDisplayPackage({ bedrockRoot = defaultBedrockRoot, built = false } = {}) {
	const behaviorRoot = resolve(bedrockRoot, "behavior_pack");
	const resourceRoot = resolve(bedrockRoot, "resource_pack");
	const [terrain, enUs, zhCn, displayBlock, placardBlock, tickerBlock, displayLoot, placardLoot, tickerLoot, displayRuntime, displayLogic, placardRuntime, placardLogic, tickerRuntime, tickerLogic, redstoneRuntime, main, marker] = await Promise.all([
		readJson(resolve(resourceRoot, "textures", "terrain_texture.json")),
		readFile(resolve(resourceRoot, "texts", "en_US.lang"), "utf8"),
		readFile(resolve(resourceRoot, "texts", "zh_CN.lang"), "utf8"),
		readJson(resolve(behaviorRoot, "blocks", "display_board.json")),
		readJson(resolve(behaviorRoot, "blocks", "placard.json")),
		readJson(resolve(behaviorRoot, "blocks", "stock_ticker.json")),
		readJson(resolve(behaviorRoot, "loot_tables", "blocks", "display_board.json")),
		readJson(resolve(behaviorRoot, "loot_tables", "blocks", "placard.json")),
		readJson(resolve(behaviorRoot, "loot_tables", "blocks", "stock_ticker.json")),
		readFile(resolve(behaviorRoot, "scripts", "materials", "display-board-runtime.js"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "materials", "display-board.js"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "materials", "placard-runtime.js"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "materials", "placard.js"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "materials", "stock-ticker-runtime.js"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "materials", "stock-ticker.js"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "redstone", "redstone-device-runtime.js"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "main.js"), "utf8"),
		readJson(resolve(behaviorRoot, "entities", "display_board_text.json"))
	]);
	const languageSets = [languageKeys(enUs), languageKeys(zhCn)];
	const geometries = plannedGeometryIdentifiers();
	for (const [atlasKey, sourceTexture] of DISPLAY_TEXTURES) {
		if (!JAVA_BLOCK_TEXTURES.includes(sourceTexture)
			|| terrain.texture_data?.[atlasKey]?.textures !== `textures/create_java/block/${sourceTexture.slice(0, -4)}`)
			throw new Error(`C2 display package must stage ${sourceTexture} in the Java atlas`);
		const texture = built
			? resolve(resourceRoot, "textures", "create_java", "block", sourceTexture)
			: resolve(repositoryRoot, "src/main/resources/assets/create/textures/block", sourceTexture);
		if (!await fileExists(texture))
			throw new Error(`C2 display package texture is missing: ${sourceTexture}`);
	}
	for (const [name, definition, loot] of [
		["display_board", displayBlock, displayLoot],
		["placard", placardBlock, placardLoot],
		["stock_ticker", tickerBlock, tickerLoot]
	]) {
		const block = definition["minecraft:block"];
		if (block?.description?.identifier !== `createbedrock:${name}`
			|| block?.components?.["minecraft:loot"] !== `loot_tables/blocks/${name}.json`
			|| loot.pools?.[0]?.entries?.[0]?.name !== `createbedrock:${name}`
			|| !languageSets.every(keys => keys.has(`tile.createbedrock:${name}.name`)))
			throw new Error(`C2 ${name} must retain block identity, self drop, and EN/ZH localization`);
	}
	const display = displayBlock["minecraft:block"];
	if (!geometries.has("geometry.createbedrock.display_board")
		|| display?.components?.["minecraft:geometry"] !== "geometry.createbedrock.display_board"
		|| JSON.stringify(display?.description?.properties?.["createbedrock:active"]) !== JSON.stringify([0, 1])
		|| JSON.stringify(display?.description?.properties?.["createbedrock:glowing"]) !== JSON.stringify([0, 1])
		|| marker["minecraft:entity"]?.description?.identifier !== "createbedrock:display_board_text")
		throw new Error("C2 Display Board must retain Java geometry, active/glow state, and a dedicated display marker");
	if (!displayRuntime.includes("registerMovingBlockDataContributor(DISPLAY_BOARD_BLOCK, \"display_board\"")
		|| !displayRuntime.includes("collectDisplayBoardGroup") || !displayRuntime.includes("writeDisplayBoardLine")
		|| !displayLogic.includes("DISPLAY_BOARD_MAX_WIDTH = 32") || !displayLogic.includes("DISPLAY_BOARD_MAX_HEIGHT = 32")
		|| !redstoneRuntime.includes("writeDisplayBoardLine") || !main.includes("registerDisplayBoards(getKineticWorldForTesting())"))
		throw new Error("C2 Display Board must preserve a 32×32 controller, moving state, kinetic gate, and Display Link target adapter");
	const placard = placardBlock["minecraft:block"];
	if (!geometries.has("geometry.createbedrock.placard")
		|| placard?.components?.["minecraft:geometry"] !== "geometry.createbedrock.placard"
		|| JSON.stringify(placard?.description?.properties?.["createbedrock:has_item"]) !== JSON.stringify([0, 1])
		|| JSON.stringify(placard?.description?.properties?.["createbedrock:powered"]) !== JSON.stringify([0, 1]))
		throw new Error("C2 Placard must retain Java geometry plus stored-item and redstone states");
	if (!placardRuntime.includes("registerMovingBlockDataContributor(PLACARD_BLOCK, \"placard\"")
		|| !placardRuntime.includes("setHeldInventoryItem") || !placardLogic.includes("PLACARD_PULSE_TICKS = 20")
		|| !placardLogic.includes("triggerPlacard") || !main.includes("registerPlacards()"))
		throw new Error("C2 Placard must retain durable item storage, 20-tick matching-item output, and moving-state wiring");
	const ticker = tickerBlock["minecraft:block"];
	if (!geometries.has("geometry.createbedrock.stock_ticker")
		|| ticker?.components?.["minecraft:geometry"] !== "geometry.createbedrock.stock_ticker"
		|| JSON.stringify(ticker?.description?.properties?.["createbedrock:request_status"]) !== JSON.stringify([0, 1, 2, 3, 4]))
		throw new Error("C2 Stock Ticker must retain Java geometry and durable request status state");
	if (!tickerRuntime.includes("requestDepotItem") || !tickerRuntime.includes("countDepotNetworkItem")
		|| !tickerRuntime.includes("registerMovingBlockDataContributor(STOCK_TICKER_BLOCK, \"stock_ticker\"")
		|| !tickerLogic.includes("STOCK_TICKER_MAX_CATEGORIES = 9") || !main.includes("registerStockTickers()"))
		throw new Error("C2 Stock Ticker must persist categories and route requests through the existing Depot network");
	return {
		deferredSurvivalAcquisitions: [
			"Display Board requires electron tubes and dark metal; enable its Java recipe only after those production chains exist.",
			"Placard requires a brass sheet and cogwheel; enable its Java recipe only after the matching processing chains exist.",
			"Stock Ticker requires a Stock Link; enable its Java recipe only after the linked-logistics acquisition chain exists."
		],
		persistentBlocks: 3
	};
}
