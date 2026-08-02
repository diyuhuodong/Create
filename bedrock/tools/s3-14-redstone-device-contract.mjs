import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { REDSTONE_BLOCK_DEVICES, REDSTONE_ITEM_DEVICES, allRedstoneAcceptanceIds } from "../behavior_pack/scripts/redstone/redstone-device-catalog.js";
import { NATIVE_REDSTONE_INPUT_COMPONENT } from "../behavior_pack/scripts/redstone/redstone-target.js";
import { hasRegisteredBlockComponent } from "./block-custom-component-compatibility.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");

async function readJson(file) {
	try {
		return JSON.parse(await readFile(file, "utf8"));
	} catch (error) {
		throw new Error(`Invalid JSON in ${file}: ${error.message}`);
	}
}

async function mustExist(file, label) {
	try {
		if (!(await stat(file)).isFile())
			throw new Error("not a file");
	} catch {
		throw new Error(`S3-14 ${label} is missing: ${file}`);
	}
}

function identifier(device) {
	return device.blockId.slice("createbedrock:".length);
}

function translationMap(source) {
	return new Map(source.split("\n").filter(Boolean).map(line => {
		const separator = line.indexOf("=");
		return [line.slice(0, separator), line.slice(separator + 1)];
	}));
}

function expectedSignalValues(device) {
	return device.id === "analog_lever" || device.id === "redstone_link" ? Array.from({ length: 16 }, (_, value) => value) : [0, 1];
}

function assertNativeOutput(device, block) {
	if (!device.output)
		return;
	const properties = block["minecraft:block"]?.description?.properties ?? {};
	const property = device.id === "analog_lever" || device.id === "redstone_link" ? "createbedrock:signal" : "createbedrock:powered";
	const expected = expectedSignalValues(device);
	if (JSON.stringify(properties[property]) !== JSON.stringify(expected))
		throw new Error(`S3-14 ${device.blockId} must persist the native producer state ${property}`);
	const permutations = block["minecraft:block"]?.permutations;
	if (!Array.isArray(permutations) || permutations.length !== expected.length)
		throw new Error(`S3-14 ${device.blockId} must define every native producer permutation`);
	const powers = permutations.map(entry => entry?.components?.["minecraft:redstone_producer"]?.power).sort((left, right) => left - right);
	const expectedPowers = device.id === "analog_lever" || device.id === "redstone_link" ? expected : [0, 15];
	if (JSON.stringify(powers) !== JSON.stringify(expectedPowers))
		throw new Error(`S3-14 ${device.blockId} must provide its exact native producer power range`);
}

function assertNativeInput(device, block) {
	const components = block["minecraft:block"]?.components ?? {};
	if (!device.input)
		return;
	if (components["minecraft:redstone_consumer"]?.min_power !== 0
		|| components["minecraft:redstone_consumer"]?.propagates_power !== false
		|| !hasRegisteredBlockComponent(components, NATIVE_REDSTONE_INPUT_COMPONENT))
		throw new Error(`S3-14 ${device.blockId} must bind the stable native redstone consumer`);
}

function assertDisplayFeedback(device, block) {
	if (device.id !== "display_link" && device.id !== "nixie_tube")
		return;
	const permutations = block["minecraft:block"]?.permutations;
	if (!Array.isArray(permutations) || permutations.length !== 16)
		throw new Error(`S3-14 ${device.blockId} must expose every display strength visually`);
	const emission = permutations.map(entry => entry?.components?.["minecraft:light_emission"])
		.sort((left, right) => left - right);
	if (JSON.stringify(emission) !== JSON.stringify(Array.from({ length: 16 }, (_, value) => value)))
		throw new Error(`S3-14 ${device.blockId} must map display strength to native visual feedback`);
}

function assertResourceDefinition(device, block) {
	const components = block["minecraft:block"]?.components ?? {};
	const geometry = components["minecraft:geometry"];
	if (typeof geometry !== "string" || !geometry.startsWith("geometry.createbedrock."))
		throw new Error(`S3-14 ${device.blockId} must use a purpose-specific converted geometry`);
	const material = components["minecraft:material_instances"]?.redstone_surface;
	if (!material?.texture?.startsWith("createbedrock_"))
		throw new Error(`S3-14 ${device.blockId} must bind a sourced redstone texture`);
}

export async function validateStage3RedstoneDeviceSourceContract({ bedrockRoot = defaultBedrockRoot } = {}) {
	const behaviorRoot = resolve(bedrockRoot, "behavior_pack");
	const resourceRoot = resolve(bedrockRoot, "resource_pack");
	const [enUs, zhCn, runtime, stateMachine] = await Promise.all([
		readFile(resolve(resourceRoot, "texts", "en_US.lang"), "utf8"),
		readFile(resolve(resourceRoot, "texts", "zh_CN.lang"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "redstone", "redstone-device-runtime.js"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "redstone", "redstone-device-state.js"), "utf8")
	]);
	if (!runtime.includes("ShardedStateStore") || !runtime.includes("registerNativeRedstoneEventHandler") || !runtime.includes("refreshRedstoneLinkNetwork"))
		throw new Error("S3-14 runtime must persist native devices and route consumer events through the local link network");
	if (!stateMachine.includes("transitionRedstoneDevice") || !stateMachine.includes("nativeOutputPower"))
		throw new Error("S3-14 runtime must have a deterministic device state machine");
	const english = translationMap(enUs);
	const chinese = translationMap(zhCn);
	for (const device of REDSTONE_BLOCK_DEVICES) {
		const name = identifier(device);
		const [block, loot, recipe] = await Promise.all([
			readJson(resolve(behaviorRoot, "blocks", `${name}.json`)),
			readJson(resolve(behaviorRoot, "loot_tables", "blocks", `${name}.json`)),
			readJson(resolve(behaviorRoot, "recipes", `${name}.json`))
		]);
		if (block.format_version !== "1.26.0" || block["minecraft:block"]?.description?.identifier !== device.blockId)
			throw new Error(`S3-14 block definition is invalid for ${device.blockId}`);
		if (loot.pools?.[0]?.entries?.[0]?.name !== device.blockId)
			throw new Error(`S3-14 ${device.blockId} must explicitly drop itself`);
		if (recipe["minecraft:recipe_shapeless"]?.result?.item !== device.blockId)
			throw new Error(`S3-14 ${device.blockId} must have an obtainable recipe`);
		if (!english.has(`tile.${device.blockId}.name`) || !chinese.has(`tile.${device.blockId}.name`))
			throw new Error(`S3-14 ${device.blockId} requires English and Chinese translations`);
		assertResourceDefinition(device, block);
		assertNativeInput(device, block);
		assertNativeOutput(device, block);
		assertDisplayFeedback(device, block);
	}
	for (const device of REDSTONE_ITEM_DEVICES) {
		const item = await readJson(resolve(behaviorRoot, "items", `${device.id}.json`));
		const recipe = await readJson(resolve(behaviorRoot, "recipes", `${device.id}.json`));
		if (item["minecraft:item"]?.description?.identifier !== device.itemId
			|| recipe["minecraft:recipe_shapeless"]?.result?.item !== device.itemId
			|| !english.has(`item.${device.itemId}.name`) || !chinese.has(`item.${device.itemId}.name`))
			throw new Error(`S3-14 linked controller requires an item, recipe, and translations`);
	}
	return { acceptanceIds: allRedstoneAcceptanceIds().length, blocks: REDSTONE_BLOCK_DEVICES.length, items: REDSTONE_ITEM_DEVICES.length };
}

export async function validateStage3RedstoneBuiltContract({ buildRoot } = {}) {
	if (!buildRoot)
		throw new TypeError("S3-14 built redstone validation requires a build root");
	const source = await validateStage3RedstoneDeviceSourceContract({ bedrockRoot: buildRoot });
	for (const device of REDSTONE_BLOCK_DEVICES) {
		const block = await readJson(resolve(buildRoot, "behavior_pack", "blocks", `${identifier(device)}.json`));
		const geometry = block["minecraft:block"].components["minecraft:geometry"];
		const model = geometry.slice("geometry.createbedrock.".length);
		await mustExist(resolve(buildRoot, "resource_pack", "models", "blocks", `${model}.geo.json`), `${device.blockId} converted geometry`);
	}
	return source;
}
