import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Script API 2.8 associates registered block components through this array.
// The source pack retains the former direct-key notation for older tooling;
// normalize the staged pack so the distributed add-on runs on current Bedrock.
export const REGISTERED_BLOCK_COMPONENT_IDS = Object.freeze([
	"createbedrock:redstone_input",
	"createbedrock:bell_runtime",
	"createbedrock:desk_bell_interaction",
	"createbedrock:experience_block_particle",
	"createbedrock:rose_quartz_lamp_runtime",
	"createbedrock:steam_whistle_runtime"
]);

const registeredComponentIds = new Set(REGISTERED_BLOCK_COMPONENT_IDS);

export function hasRegisteredBlockComponent(components, componentId) {
	return Object.hasOwn(components ?? {}, componentId)
		|| components?.["minecraft:custom_components"]?.includes(componentId) === true;
}

export function normalizeBlockCustomComponents(definition) {
	const components = definition?.["minecraft:block"]?.components;
	if (!components)
		return [];
	const declared = Array.isArray(components["minecraft:custom_components"])
		? [...components["minecraft:custom_components"]]
		: [];
	const moved = REGISTERED_BLOCK_COMPONENT_IDS.filter(componentId => Object.hasOwn(components, componentId));
	for (const componentId of moved) {
		delete components[componentId];
		if (!declared.includes(componentId))
			declared.push(componentId);
	}
	if (moved.length > 0)
		components["minecraft:custom_components"] = declared;
	return moved;
}

async function blockFiles(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	return entries.filter(entry => entry.isFile() && entry.name.endsWith(".json"))
		.map(entry => resolve(directory, entry.name));
}

export async function normalizeStagedBlockCustomComponents({ behaviorPackRoot }) {
	const files = await blockFiles(resolve(behaviorPackRoot, "blocks"));
	let blocks = 0;
	let components = 0;
	for (const file of files) {
		const definition = JSON.parse(await readFile(file, "utf8"));
		const moved = normalizeBlockCustomComponents(definition);
		if (moved.length === 0)
			continue;
		await writeFile(file, `${JSON.stringify(definition, null, 2)}\n`);
		blocks++;
		components += moved.length;
	}
	return { blocks, components };
}

export function isRegisteredBlockComponent(componentId) {
	return registeredComponentIds.has(componentId);
}
