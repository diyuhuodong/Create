import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");

export const S3_12_FLUID_BLOCKS = [
	"copper_valve_handle",
	"creative_fluid_tank",
	"encased_fluid_pipe",
	"fluid_valve",
	"glass_fluid_pipe",
	"item_drain",
	"portable_fluid_interface",
	"smart_fluid_pipe",
	"spout"
];

async function readJson(file) {
	try {
		return JSON.parse(await readFile(file, "utf8"));
	} catch (error) {
		throw new Error(`Invalid JSON in ${file}: ${error.message}`);
	}
}

async function languageKeys(file) {
	return new Set((await readFile(file, "utf8")).split(/\r?\n/).map(line => line.split("=", 1)[0]));
}

export async function validateStage3FluidSourceContract({ bedrockRoot = defaultBedrockRoot } = {}) {
	const behaviorRoot = resolve(bedrockRoot, "behavior_pack");
	const resourceRoot = resolve(bedrockRoot, "resource_pack");
	const [english, chinese, runtime, network, state] = await Promise.all([
		languageKeys(resolve(resourceRoot, "texts", "en_US.lang")),
		languageKeys(resolve(resourceRoot, "texts", "zh_CN.lang")),
		readFile(resolve(behaviorRoot, "scripts", "fluids", "fluid-runtime.js"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "fluids", "fluid-network.js"), "utf8"),
		readFile(resolve(behaviorRoot, "scripts", "fluids", "fluid-network-state.js"), "utf8")
	]);
	for (const identifier of S3_12_FLUID_BLOCKS) {
		const definition = await readJson(resolve(behaviorRoot, "blocks", `${identifier}.json`));
		const block = definition["minecraft:block"];
		const fullIdentifier = `createbedrock:${identifier}`;
		if (block?.description?.identifier !== fullIdentifier)
			throw new Error(`S3-12 fluid block ${identifier} has an incorrect identifier`);
		if (!block.description.menu_category?.category)
			throw new Error(`S3-12 fluid block ${identifier} is missing creative access`);
		if (typeof block.components?.["minecraft:geometry"] !== "string"
			|| typeof block.components?.["minecraft:item_visual"]?.geometry?.identifier !== "string")
			throw new Error(`S3-12 fluid block ${identifier} is missing a block or item geometry`);
		if (typeof block.components?.["minecraft:loot"] !== "string")
			throw new Error(`S3-12 fluid block ${identifier} is missing explicit loot`);
		await stat(resolve(behaviorRoot, block.components["minecraft:loot"]));
		if (!english.has(`tile.${fullIdentifier}.name`) || !chinese.has(`tile.${fullIdentifier}.name`))
			throw new Error(`S3-12 fluid block ${identifier} is missing EN/ZH translations`);
		if (!runtime.includes(fullIdentifier))
			throw new Error(`S3-12 fluid block ${identifier} is not registered by the fluid runtime`);
	}
	for (const token of ["CreativeFluidPort", "FLUID_ENDPOINT_CAPACITIES", "FLUID_PIPE_BLOCKS", "setPipeFilter", "toggleValve", "portable_fluid_interface"]) {
		if (!runtime.includes(token) && !network.includes(token) && !state.includes(token))
			throw new Error(`S3-12 fluid runtime is missing ${token}`);
	}
	if (!network.includes("predicate: link.filter") || !state.includes("updateExternalPortDescriptor"))
		throw new Error("S3-12 fluid runtime is missing durable filter or creative-descriptor handling");
	return { blocks: S3_12_FLUID_BLOCKS.length };
}
