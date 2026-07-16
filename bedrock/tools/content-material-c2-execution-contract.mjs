import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { plannedGeometryIdentifiers } from "./convert-java-models.mjs";
import { JAVA_BLOCK_TEXTURES, JAVA_SOUND_ASSETS } from "./import-java-assets.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");
const CLOCKS = ["cuckoo_clock", "mysterious_cuckoo_clock"];
const BELLS = ["peculiar_bell", "haunted_bell"];
const DOORS = ["andesite_door", "brass_door", "copper_door", "framed_glass_door", "train_door"];
const RECIPES = ["cuckoo_clock", "mysterious_cuckoo_clock", "peculiar_bell", "andesite_door", "brass_door", "copper_door", "train_door", "steam_whistle"];

async function json(path) {
	return JSON.parse(await readFile(path, "utf8"));
}

async function exists(path) {
	try {
		return (await stat(path)).isFile();
	} catch {
		return false;
	}
}

function languageKeys(contents) {
	return new Set(contents.split(/\r?\n/).map(line => line.split("=", 1)[0]).filter(Boolean));
}

async function assertSelfDrop(behaviorRoot, id) {
	const table = await json(resolve(behaviorRoot, "loot_tables", "blocks", `${id}.json`));
	if (table.pools?.[0]?.entries?.[0]?.name !== `createbedrock:${id}`)
		throw new Error(`C2 ${id} must define an explicit self drop`);
}

/** C2-C/D/E must travel as behavior, Java-derived visuals, language and obtainable content together. */
export async function validateContentMaterialC2Execution({ bedrockRoot = defaultBedrockRoot, built = false } = {}) {
	const behaviorRoot = resolve(bedrockRoot, "behavior_pack");
	const resourceRoot = resolve(bedrockRoot, "resource_pack");
	const geometries = plannedGeometryIdentifiers();
	const [main, clockRuntime, bellRuntime, doorRuntime, whistleRuntime, en, zh] = await Promise.all([
		readFile(resolve(behaviorRoot, "scripts", "main.js"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "materials", "cuckoo-clock-runtime.js"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "materials", "bell-runtime.js"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "materials", "sliding-door-runtime.js"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "materials", "steam-whistle-runtime.js"), "utf8"),
		readFile(resolve(resourceRoot, "texts", "en_US.lang"), "utf8"),
		readFile(resolve(resourceRoot, "texts", "zh_CN.lang"), "utf8")
	]);
	if (!main.includes("registerCuckooClocks") || !main.includes("registerBells") || !main.includes("registerSlidingDoors") || !main.includes("registerSteamWhistles"))
		throw new Error("C2 runtime packages must be registered from scripts/main.js");
	if (!clockRuntime.includes("createExplosion") || !bellRuntime.includes("HAUNTED_BELL_PULSE_DISTANCE") || !doorRuntime.includes("initializeSlidingDoor") || !whistleRuntime.includes("inspectFluidTank"))
		throw new Error("C2 runtime packages must retain clock surprise, bell pulse, paired-door, and fluid-gated whistle behavior");
	if (!bellRuntime.includes('registerMovingBlockDataContributor(typeId, "bell"')
		|| !bellRuntime.includes("schemaVersion: 1")
		|| !bellRuntime.includes("captureBellData")
		|| !doorRuntime.includes('registerMovingBlockDataContributor(typeId, "sliding_door"')
		|| !doorRuntime.includes("matchingDoubleDoor")
		|| !doorRuntime.includes("applySlidingDoorPower"))
		throw new Error("C2 bells and sliding doors must retain contraption persistence, paired state, and native-redstone behavior");
	const languages = [languageKeys(en), languageKeys(zh)];
	for (const id of [...CLOCKS, ...BELLS, ...DOORS, "steam_whistle"]) {
		const definition = await json(resolve(behaviorRoot, "blocks", `${id}.json`));
		if (definition["minecraft:block"]?.description?.identifier !== `createbedrock:${id}`)
			throw new Error(`C2 ${id} block identifier is missing`);
		if (!languages.every(keys => keys.has(`tile.createbedrock:${id}.name`)))
			throw new Error(`C2 ${id} requires EN and ZH language keys`);
		await assertSelfDrop(behaviorRoot, id);
	}
	for (const id of CLOCKS)
		if (!geometries.has("geometry.createbedrock.cuckoo_clock"))
			throw new Error(`C2 ${id} requires Java-derived Cuckoo Clock geometry`);
	for (const id of BELLS)
		if (!geometries.has(`geometry.createbedrock.${id}`))
			throw new Error(`C2 ${id} requires Java-derived bell geometry`);
	for (const id of DOORS)
		for (const half of ["bottom", "top"])
			if (!geometries.has(`geometry.createbedrock.${id}_${half}`))
				throw new Error(`C2 ${id} requires Java-derived ${half} geometry`);
	for (const size of ["small", "medium", "large"])
		if (!geometries.has(`geometry.createbedrock.steam_whistle_${size}_floor`))
			throw new Error(`C2 Steam Whistle requires Java-derived ${size} geometry`);
	const extension = await json(resolve(behaviorRoot, "blocks", "steam_whistle_extension.json"));
	if (extension["minecraft:block"]?.description?.identifier !== "createbedrock:steam_whistle_extension")
		throw new Error("C2 Steam Whistle extension block is missing");
	const extensionLoot = await json(resolve(behaviorRoot, "loot_tables", "blocks", "steam_whistle_extension.json"));
	if (extensionLoot.pools?.[0]?.entries?.[0]?.name !== "createbedrock:steam_whistle")
		throw new Error("C2 Steam Whistle extension must return its whistle item");
	for (const id of RECIPES) {
		const recipe = await json(resolve(behaviorRoot, "recipes", `${id}.json`));
		const key = Object.keys(recipe).find(name => name.startsWith("minecraft:recipe_"));
		if (!key || recipe[key]?.description?.identifier !== `createbedrock:${id}`)
			throw new Error(`C2 ${id} requires a real Bedrock acquisition recipe`);
	}
	for (const texture of ["cuckoo_clock.png", "bell.png", "whistle.png", "andesite_door_side.png", "brass_door_side.png", "copper_door_side.png", "train_door_side.png"])
		if (!JAVA_BLOCK_TEXTURES.includes(texture))
			throw new Error(`C2 Java texture ${texture} must be staged`);
	for (const sound of ["haunted_bell_use.ogg", "haunted_bell_convert.ogg", "whistle.ogg", "whistle_low.ogg", "whistle_high.ogg"])
		if (!JAVA_SOUND_ASSETS.some(entry => entry.source === sound))
			throw new Error(`C2 Java sound ${sound} must be staged`);
	if (built && !await exists(resolve(resourceRoot, "textures", "create_java", "block", "cuckoo_clock.png")))
		throw new Error("Built C2 pack is missing staged Java textures");
	return { blocks: CLOCKS.length + BELLS.length + DOORS.length + 2, recipes: RECIPES.length };
}
