import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { plannedGeometryIdentifiers } from "./convert-java-models.mjs";
import { JAVA_BLOCK_TEXTURES, JAVA_SOUND_ASSETS } from "./import-java-assets.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(defaultBedrockRoot, "..");

const DESK_BELL = {
	identifier: "createbedrock:desk_bell",
	geometry: "geometry.createbedrock.desk_bell",
	poweredGeometry: "geometry.createbedrock.desk_bell_powered",
	sourceTexture: "desk_bell.png",
	texture: "createbedrock_desk_bell",
	sound: "createbedrock:desk_bell",
	soundAsset: { source: "desk_bell.ogg", target: "create/desk_bell.ogg" }
};

const FACING_TO_STRONG_FACE = new Map([
	[0, "down"], [1, "up"], [2, "north"], [3, "south"], [4, "west"], [5, "east"]
]);

const ROSE_QUARTZ_LAMP = {
	identifier: "createbedrock:rose_quartz_lamp",
	textures: [
		["createbedrock_rose_quartz_lamp", "rose_quartz_lamp.png"],
		["createbedrock_rose_quartz_lamp_powered", "rose_quartz_lamp_powered.png"]
	]
};

const ROSE_QUARTZ_LAMP_FACES = [
	["north", 1], ["east", 2], ["south", 4], ["west", 8], ["up", 16], ["down", 32]
];

const STOCKPILE_SWITCH = {
	identifier: "createbedrock:stockpile_switch",
	geometries: [
		"geometry.createbedrock.stockpile_switch_wall",
		"geometry.createbedrock.stockpile_switch_floor",
		"geometry.createbedrock.stockpile_switch_ceiling"
	],
	textures: [
		["createbedrock_stockpile_switch_back", "threshold_switch_back.png"],
		["createbedrock_stockpile_switch_front", "threshold_switch_front.png"],
		["createbedrock_stockpile_switch_level_0", "threshold_switch/level_0.png"],
		["createbedrock_stockpile_switch_level_1", "threshold_switch/level_1.png"],
		["createbedrock_stockpile_switch_level_2", "threshold_switch/level_2.png"],
		["createbedrock_stockpile_switch_level_3", "threshold_switch/level_3.png"],
		["createbedrock_stockpile_switch_level_4", "threshold_switch/level_4.png"],
		["createbedrock_stockpile_switch_level_5", "threshold_switch/level_5.png"],
		["createbedrock_stockpile_switch_top", "smart_observer_top.png"],
		["createbedrock_stockpile_switch_tunnel_top", "tunnel/brass_tunnel_top_connected.png"]
	]
};

const STOCKPILE_SWITCH_OUTPUT_FACES = new Map([
	[0, ["north", "east", "south", "west", "down"]],
	[1, ["north", "east", "south", "west", "up"]],
	[2, ["north", "east", "west", "up", "down"]],
	[3, ["east", "south", "west", "up", "down"]],
	[4, ["north", "south", "west", "up", "down"]],
	[5, ["north", "east", "south", "up", "down"]]
]);

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

function expectedCondition(facing, powered) {
	return `query.block_state('minecraft:facing_direction') == ${facing} && query.block_state('createbedrock:powered') == ${powered}`;
}

/**
 * C2 begins with persistent or animated content only when its source behavior
 * is wired into a runtime. Desk Bell is the first reusable pattern: source
 * geometry, sound, timed output, attachment-facing strong power, water, loot,
 * and creative visibility travel together.
 */
export async function validateContentMaterialPersistent({ bedrockRoot = defaultBedrockRoot, built = false } = {}) {
	const behaviorRoot = resolve(bedrockRoot, "behavior_pack");
	const resourceRoot = resolve(bedrockRoot, "resource_pack");
	const [definition, loot, lampDefinition, lampLoot, stockpileDefinition, stockpileLoot, terrain, soundDefinitions, enUs, zhCn, runtime, deskBellSource, lampRuntime, stockpileRuntime, stockpileLogic, main, lampSource, stockpileBlockSource, stockpileEntitySource] = await Promise.all([
		readJson(resolve(behaviorRoot, "blocks", "desk_bell.json")),
		readJson(resolve(behaviorRoot, "loot_tables", "blocks", "desk_bell.json")),
		readJson(resolve(behaviorRoot, "blocks", "rose_quartz_lamp.json")),
		readJson(resolve(behaviorRoot, "loot_tables", "blocks", "rose_quartz_lamp.json")),
		readJson(resolve(behaviorRoot, "blocks", "stockpile_switch.json")),
		readJson(resolve(behaviorRoot, "loot_tables", "blocks", "stockpile_switch.json")),
		readJson(resolve(resourceRoot, "textures", "terrain_texture.json")),
		readJson(resolve(resourceRoot, "sounds", "sound_definitions.json")),
		readFile(resolve(resourceRoot, "texts", "en_US.lang"), "utf8"),
		readFile(resolve(resourceRoot, "texts", "zh_CN.lang"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "materials", "desk-bell-runtime.js"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "materials", "desk-bell.js"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "materials", "rose-quartz-lamp-runtime.js"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "materials", "stockpile-switch-runtime.js"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "materials", "stockpile-switch.js"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "main.js"), "utf8"),
		readFile(resolve(repositoryRoot, "src/main/java/com/simibubi/create/content/redstone/RoseQuartzLampBlock.java"), "utf8"),
		readFile(resolve(repositoryRoot, "src/main/java/com/simibubi/create/content/redstone/thresholdSwitch/ThresholdSwitchBlock.java"), "utf8"),
		readFile(resolve(repositoryRoot, "src/main/java/com/simibubi/create/content/redstone/thresholdSwitch/ThresholdSwitchBlockEntity.java"), "utf8")
	]);
	const block = definition["minecraft:block"];
	const components = block?.components ?? {};
	const permutations = block?.permutations ?? [];
	const geometries = plannedGeometryIdentifiers();
	const languageSets = [languageKeys(enUs), languageKeys(zhCn)];
	if (block?.description?.identifier !== DESK_BELL.identifier
		|| JSON.stringify((block?.description?.states ?? block?.description?.properties)?.["createbedrock:powered"]) !== JSON.stringify([0, 1])
		|| !block?.description?.traits?.["minecraft:placement_direction"]?.enabled_states?.includes("minecraft:facing_direction")
		|| components["minecraft:geometry"] !== DESK_BELL.geometry
		|| components["minecraft:item_visual"]?.geometry?.identifier !== DESK_BELL.geometry
		|| components["minecraft:loot"] !== "loot_tables/blocks/desk_bell.json"
		|| !Object.hasOwn(components, "createbedrock:desk_bell_interaction"))
		throw new Error("C2 Desk Bell must retain its stateful directional block definition and runtime component");
	if (!geometries.has(DESK_BELL.geometry) || !geometries.has(DESK_BELL.poweredGeometry))
		throw new Error("C2 Desk Bell must use Java-derived idle and pressed geometry");
	if (components["minecraft:material_instances"]?.desk_bell?.texture !== DESK_BELL.texture
		|| components["minecraft:item_visual"]?.material_instances?.desk_bell?.texture !== DESK_BELL.texture
		|| terrain.texture_data?.[DESK_BELL.texture]?.textures !== "textures/create_java/block/desk_bell")
		throw new Error("C2 Desk Bell must retain its Java-derived texture atlas mapping");
	if (!JAVA_BLOCK_TEXTURES.includes(DESK_BELL.sourceTexture))
		throw new Error("C2 Desk Bell texture must be staged by import-java-assets.mjs");
	if (!JAVA_SOUND_ASSETS.some(asset => asset.source === DESK_BELL.soundAsset.source && asset.target === DESK_BELL.soundAsset.target)
		|| soundDefinitions.sound_definitions?.[DESK_BELL.sound]?.sounds?.[0] !== "sounds/create/desk_bell")
		throw new Error("C2 Desk Bell must stage and declare the Java desk-bell sound");
	if (loot.pools?.[0]?.entries?.[0]?.name !== DESK_BELL.identifier)
		throw new Error("C2 Desk Bell must preserve its explicit self drop");
	if (!languageSets.every(keys => keys.has(`tile.${DESK_BELL.identifier}.name`)))
		throw new Error("C2 Desk Bell must retain EN and ZH localization");
	for (const [facing, strongFace] of FACING_TO_STRONG_FACE) {
		const idle = permutations.find(entry => entry.condition === expectedCondition(facing, 0));
		const pressed = permutations.find(entry => entry.condition === expectedCondition(facing, 1));
		if (idle?.components?.["minecraft:geometry"] !== DESK_BELL.geometry
			|| pressed?.components?.["minecraft:geometry"] !== DESK_BELL.poweredGeometry
			|| pressed?.components?.["minecraft:redstone_producer"]?.power !== 15
			|| pressed.components["minecraft:redstone_producer"].strongly_powered_face !== strongFace)
			throw new Error(`C2 Desk Bell must provide its pressed geometry and directional strong power for facing ${facing}`);
	}
	if (!deskBellSource.includes("DESK_BELL_PRESS_TICKS = 20") || !runtime.includes("deskBellReleaseDelay()")
		|| !runtime.includes("block.dimension.playSound") || !main.includes("registerDeskBell()"))
		throw new Error("C2 Desk Bell must register a timed sound-and-redstone runtime");
	const textureFile = built
		? resolve(resourceRoot, "textures", "create_java", "block", DESK_BELL.sourceTexture)
		: resolve(repositoryRoot, "src/main/resources/assets/create/textures/block", DESK_BELL.sourceTexture);
	const soundFile = built
		? resolve(resourceRoot, "sounds", DESK_BELL.soundAsset.target)
		: resolve(repositoryRoot, "src/main/resources/assets/create/sounds", DESK_BELL.soundAsset.source);
	if (!await fileExists(textureFile) || !await fileExists(soundFile))
		throw new Error("C2 Desk Bell Java-derived texture or sound source is missing");

	const lamp = lampDefinition["minecraft:block"];
	const lampComponents = lamp?.components ?? {};
	const lampPermutations = lamp?.permutations ?? [];
	const outputMasks = (lamp?.description?.states ?? lamp?.description?.properties)?.["createbedrock:output_mask"];
	if (lamp?.description?.identifier !== ROSE_QUARTZ_LAMP.identifier
		|| lampComponents["minecraft:geometry"] !== "geometry.createbedrock.rose_quartz_lamp"
		|| lampComponents["minecraft:item_visual"]?.geometry?.identifier !== "geometry.createbedrock.rose_quartz_lamp"
		|| lampComponents["minecraft:material_instances"]?.all?.texture !== "createbedrock_rose_quartz_lamp"
		|| lampComponents["minecraft:item_visual"]?.material_instances?.all?.texture !== "createbedrock_rose_quartz_lamp"
		|| JSON.stringify((lamp?.description?.states ?? lamp?.description?.properties)?.["createbedrock:activate"]) !== JSON.stringify([0, 1])
		|| JSON.stringify((lamp?.description?.states ?? lamp?.description?.properties)?.["createbedrock:powered"]) !== JSON.stringify([0, 1])
		|| JSON.stringify((lamp?.description?.states ?? lamp?.description?.properties)?.["createbedrock:powering"]) !== JSON.stringify([0, 1])
		|| !Array.isArray(outputMasks) || (built
			? JSON.stringify(outputMasks) !== JSON.stringify(Array.from({ length: 16 }, (_, value) => value))
			: outputMasks.length !== 64 || outputMasks[0] !== 63)
		|| lampComponents["minecraft:redstone_consumer"]?.propagates_power !== false
		|| JSON.stringify(lampComponents["minecraft:tick"]?.interval_range) !== JSON.stringify([1, 1])
		|| lampComponents["minecraft:tick"]?.looping !== true
		|| !Object.hasOwn(lampComponents, "createbedrock:rose_quartz_lamp_runtime")
		|| lampComponents["minecraft:loot"] !== "loot_tables/blocks/rose_quartz_lamp.json")
		throw new Error("C2 Rose Quartz Lamp must preserve its Java state, native input, tick runtime, and loot declaration");
	for (const [atlasKey, sourceTexture] of ROSE_QUARTZ_LAMP.textures) {
		if (terrain.texture_data?.[atlasKey]?.textures !== `textures/create_java/block/${sourceTexture.slice(0, -4)}`
			|| !JAVA_BLOCK_TEXTURES.includes(sourceTexture))
			throw new Error(`C2 Rose Quartz Lamp is missing its Java-derived texture ${sourceTexture}`);
		const texture = built
			? resolve(resourceRoot, "textures", "create_java", "block", sourceTexture)
			: resolve(repositoryRoot, "src/main/resources/assets/create/textures/block", sourceTexture);
		if (!await fileExists(texture))
			throw new Error(`C2 Rose Quartz Lamp texture is missing: ${texture}`);
	}
	if (lampLoot.pools?.[0]?.entries?.[0]?.name !== ROSE_QUARTZ_LAMP.identifier
		|| !languageSets.every(keys => keys.has(`tile.${ROSE_QUARTZ_LAMP.identifier}.name`)))
		throw new Error("C2 Rose Quartz Lamp must retain self-drop and EN/ZH localization");
	for (let mask = 0; mask < 64; mask++) {
		const permutation = lampPermutations.find(entry => entry.condition
			=== `query.block_state('createbedrock:powering') == 1 && query.block_state('createbedrock:output_mask') == ${mask}`);
		const expectedFaces = ROSE_QUARTZ_LAMP_FACES.filter(([, bit]) => (mask & bit) !== 0).map(([face]) => face);
		const producer = permutation?.components?.["minecraft:redstone_producer"];
		if (permutation?.components?.["minecraft:light_emission"] !== 15
			|| permutation.components?.["minecraft:material_instances"]?.["*"]?.texture !== "createbedrock_rose_quartz_lamp_powered"
			|| permutation.components?.["minecraft:material_instances"]?.all?.texture !== "createbedrock_rose_quartz_lamp_powered"
			|| producer?.power !== 15 || JSON.stringify(producer.connected_faces) !== JSON.stringify(expectedFaces))
			throw new Error(`C2 Rose Quartz Lamp must suppress output toward adjacent lamps for mask ${mask}`);
	}
	if (!lampRuntime.includes("collectConnectedRoseQuartzLamps") || !lampRuntime.includes("roseQuartzLampTickTransition")
		|| !lampRuntime.includes("onRedstoneUpdate") || !main.includes("registerRoseQuartzLamp()")
		|| !lampSource.includes("forEachInCluster") || !lampSource.includes("getDistanceToPowered"))
		throw new Error("C2 Rose Quartz Lamp must retain its Java cluster provenance and Bedrock runtime wiring");

	const stockpile = stockpileDefinition["minecraft:block"];
	const stockpileComponents = stockpile?.components ?? {};
	const stockpilePermutations = stockpile?.permutations ?? [];
	const stockpileProperties = stockpile?.description?.states ?? stockpile?.description?.properties ?? {};
	if (stockpile?.description?.identifier !== STOCKPILE_SWITCH.identifier
		|| JSON.stringify(stockpileProperties["createbedrock:target_direction"]) !== JSON.stringify([2, 3, 4, 5, 0, 1])
		|| JSON.stringify(stockpileProperties["createbedrock:display_level"]) !== JSON.stringify([0, 1, 2, 3, 4, 5])
		|| JSON.stringify(stockpileProperties["createbedrock:powered"]) !== JSON.stringify([0, 1])
		|| stockpileComponents["minecraft:geometry"] !== STOCKPILE_SWITCH.geometries[0]
		|| stockpileComponents["minecraft:loot"] !== "loot_tables/blocks/stockpile_switch.json")
		throw new Error("C2 Stockpile Switch must retain its directional state, fill display, output state, geometry, and self-drop declaration");
	if (!STOCKPILE_SWITCH.geometries.every(geometry => geometries.has(geometry)))
		throw new Error("C2 Stockpile Switch must convert Java wall, floor, and ceiling geometry");
	for (const [atlasKey, sourceTexture] of STOCKPILE_SWITCH.textures) {
		if (terrain.texture_data?.[atlasKey]?.textures !== `textures/create_java/block/${sourceTexture.slice(0, -4)}`
			|| !JAVA_BLOCK_TEXTURES.includes(sourceTexture))
			throw new Error(`C2 Stockpile Switch is missing its Java-derived texture ${sourceTexture}`);
		const texture = built
			? resolve(resourceRoot, "textures", "create_java", "block", sourceTexture)
			: resolve(repositoryRoot, "src/main/resources/assets/create/textures/block", sourceTexture);
		if (!await fileExists(texture))
			throw new Error(`C2 Stockpile Switch texture is missing: ${texture}`);
	}
	if (stockpileComponents["minecraft:material_instances"]?.brass_block?.texture !== "createbedrock_brass_block"
		|| stockpileComponents["minecraft:item_visual"]?.material_instances?.threshold_switch_front?.texture !== "createbedrock_stockpile_switch_front"
		|| stockpileLoot.pools?.[0]?.entries?.[0]?.name !== STOCKPILE_SWITCH.identifier
		|| !languageSets.every(keys => keys.has(`tile.${STOCKPILE_SWITCH.identifier}.name`)))
		throw new Error("C2 Stockpile Switch must retain its Java materials, explicit self drop, and EN/ZH localization");
	for (let level = 0; level <= 5; level++) {
		const permutation = stockpilePermutations.find(entry => entry.condition
			=== `query.block_state('createbedrock:display_level') == ${level}`);
		if (permutation?.components?.["minecraft:material_instances"]?.level_0?.texture !== `createbedrock_stockpile_switch_level_${level}`)
			throw new Error(`C2 Stockpile Switch must use its Java level texture for display level ${level}`);
	}
	for (const [target, faces] of STOCKPILE_SWITCH_OUTPUT_FACES) {
		const powered = stockpilePermutations.find(entry => entry.condition
			=== `query.block_state('createbedrock:powered') == 1 && query.block_state('createbedrock:target_direction') == ${target}`);
		const producer = powered?.components?.["minecraft:redstone_producer"];
		if (producer?.power !== 15 || JSON.stringify(producer.connected_faces) !== JSON.stringify(faces))
			throw new Error(`C2 Stockpile Switch must preserve Java's no-output-backface rule for target ${target}`);
	}
	if (!stockpileLogic.includes("STOCKPILE_SWITCH_OUTPUT_DELAY_TICKS")
		|| !stockpileRuntime.includes("measureStockpileInventory") || !stockpileRuntime.includes("inspectFluidTank")
		|| !stockpileRuntime.includes("registerMovingBlockDataContributor") || !main.includes("registerStockpileSwitch()")
		|| !stockpileBlockSource.includes("getStateForPlacement") || !stockpileBlockSource.includes("canConnectRedstone")
		|| !stockpileEntitySource.includes("updatePowerAfterDelay") || !stockpileEntitySource.includes("onWhenAbove"))
		throw new Error("C2 Stockpile Switch must preserve Java placement, hysteresis, delayed output, inventory/fluid sampling, and moving-state wiring");
	return {
		contentBlocks: 3,
		deferredSurvivalAcquisitions: [
			"Desk Bell requires a gold sheet; enable its Java recipe only after the Stage-3 pressing chain produces the matching sheet.",
			"Rose Quartz Lamp requires polished rose quartz and a zinc ingot; enable its Java recipe only after the matching polishing and material chains exist.",
			"Stockpile Switch requires an electron tube; enable its Java recipe only after the matching Stage-3 device and brass-casing chain exist."
		],
		persistentBlocks: 3
	};
}
