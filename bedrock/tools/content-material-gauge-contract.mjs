import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { plannedGeometryIdentifiers } from "./convert-java-models.mjs";
import { JAVA_BLOCK_TEXTURES } from "./import-java-assets.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");
const repositoryRoot = resolve(defaultBedrockRoot, "..");
const GAUGES = ["speedometer", "stressometer"];

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

export async function validateContentMaterialGauges({ bedrockRoot = defaultBedrockRoot, built = false } = {}) {
	const behaviorRoot = resolve(bedrockRoot, "behavior_pack");
	const resourceRoot = resolve(bedrockRoot, "resource_pack");
	const [terrain, enUs, zhCn, runtime, runtimeLogic, kineticWorld, main, ...definitions] = await Promise.all([
		readJson(resolve(resourceRoot, "textures", "terrain_texture.json")),
		readFile(resolve(resourceRoot, "texts", "en_US.lang"), "utf8"),
		readFile(resolve(resourceRoot, "texts", "zh_CN.lang"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "materials", "gauge-runtime.js"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "materials", "gauge.js"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "kinetics", "kinetic-world.js"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "main.js"), "utf8"),
		...GAUGES.map(name => readJson(resolve(behaviorRoot, "blocks", `${name}.json`)))
	]);
	const languageSets = [languageKeys(enUs), languageKeys(zhCn)];
	const geometryIdentifiers = plannedGeometryIdentifiers();
	if (!JAVA_BLOCK_TEXTURES.includes("gauge.png")
		|| terrain.texture_data?.createbedrock_gauge?.textures !== "textures/create_java/block/gauge")
		throw new Error("C2 gauges must stage the Java gauge texture in the terrain atlas");
	const texture = built
		? resolve(resourceRoot, "textures", "create_java", "block", "gauge.png")
		: resolve(repositoryRoot, "src/main/resources/assets/create/textures/block/gauge.png");
	if (!await fileExists(texture))
		throw new Error("C2 gauges require the Java gauge texture source");
	for (const [index, name] of GAUGES.entries()) {
		const block = definitions[index]?.["minecraft:block"];
		const properties = block?.description?.states ?? block?.description?.properties ?? {};
		const permutations = block?.permutations ?? [];
		if (block?.description?.identifier !== `createbedrock:${name}`
			|| JSON.stringify(properties["createbedrock:axis"]) !== JSON.stringify(["x", "y", "z"])
			|| JSON.stringify(properties["createbedrock:dial_level"]) !== JSON.stringify(Array.from({ length: 16 }, (_, level) => level))
			|| JSON.stringify(properties["createbedrock:gauge_color"]) !== JSON.stringify([0, 1, 2, 3])
			|| JSON.stringify(properties["createbedrock:signal"]) !== JSON.stringify(Array.from({ length: 16 }, (_, level) => level))
			|| block?.components?.["minecraft:loot"] !== `loot_tables/blocks/${name}.json`
			|| block?.components?.["minecraft:material_instances"]?.gauge?.texture !== "createbedrock_gauge")
			throw new Error(`C2 ${name} must retain its quantized visual, kinetic, and loot states`);
		if (!languageSets.every(keys => keys.has(`tile.createbedrock:${name}.name`)))
			throw new Error(`C2 ${name} requires EN and ZH localization`);
		for (let level = 0; level <= 15; level++) {
			const geometry = `geometry.createbedrock.${name}_gauge_${level}`;
			if (!geometryIdentifiers.has(geometry)
				|| permutations.find(entry => entry.condition === `query.block_state('createbedrock:dial_level') == ${level}`)?.components?.["minecraft:geometry"] !== geometry)
				throw new Error(`C2 ${name} must use its Java-derived dial geometry for level ${level}`);
			if (level === 0)
				continue;
			const producer = permutations.find(entry => entry.condition === `query.block_state('createbedrock:signal') == ${level}`)?.components?.["minecraft:redstone_producer"];
			if (producer?.power !== level || producer.connected_faces?.length !== 6)
				throw new Error(`C2 ${name} must emit its analog reading at redstone level ${level}`);
		}
	}
	if (!runtime.includes("registerMovingBlockDataContributor(typeId, \"gauge\"") || !runtime.includes("schemaVersion: 1")
		|| !runtime.includes("detach()") || !runtime.includes("gaugeReading")
		|| !runtimeLogic.includes("speedGaugeDialTarget") || !runtimeLogic.includes("stressGaugeDialTarget")
		|| !kineticWorld.includes("networkAt(dimensionId, location)") || !main.includes("registerGauges(getKineticWorldForTesting())"))
		throw new Error("C2 gauges must connect Java-equivalent readings to kinetic, contraption, and main runtimes");
	return { persistentBlocks: GAUGES.length };
}
