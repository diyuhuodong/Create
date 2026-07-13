import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { validateMigrationMatrix } from "./migration-matrix-schema.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(toolDirectory, "..");

async function jsonFiles(directory) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const file = resolve(directory, entry.name);
		if (entry.isDirectory())
			files.push(...await jsonFiles(file));
		else if (extname(entry.name) === ".json")
			files.push(file);
	}
	return files;
}

async function filesWithExtension(directory, extension) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const file = resolve(directory, entry.name);
		if (entry.isDirectory())
			files.push(...await filesWithExtension(file, extension));
		else if (extname(entry.name) === extension)
			files.push(file);
	}
	return files;
}

async function readJson(file) {
	try {
		return JSON.parse(await readFile(file, "utf8"));
	} catch (error) {
		throw new Error(`Invalid JSON in ${file}: ${error.message}`);
	}
}

for (const directory of ["behavior_pack", "resource_pack"]) {
	for (const file of await jsonFiles(resolve(bedrockRoot, directory)))
		await readJson(file);
}

const behaviorManifest = await readJson(resolve(bedrockRoot, "behavior_pack", "manifest.json"));
const resourceManifest = await readJson(resolve(bedrockRoot, "resource_pack", "manifest.json"));
const terrainAtlas = await readJson(resolve(bedrockRoot, "resource_pack", "textures", "terrain_texture.json"));
const itemAtlas = await readJson(resolve(bedrockRoot, "resource_pack", "textures", "item_texture.json"));
const migrationMatrix = await readJson(resolve(bedrockRoot, "data", "migration-matrix.json"));
validateMigrationMatrix(migrationMatrix);
const allUuids = [
	behaviorManifest.header.uuid,
	resourceManifest.header.uuid,
	...behaviorManifest.modules.map(module => module.uuid),
	...resourceManifest.modules.map(module => module.uuid)
];

if (new Set(allUuids).size !== allUuids.length)
	throw new Error("Behavior and resource pack UUIDs must be unique.");

const behaviorDependsOnResource = behaviorManifest.dependencies.some(dependency => dependency.uuid === resourceManifest.header.uuid);
const resourceDependsOnBehavior = resourceManifest.dependencies.some(dependency => dependency.uuid === behaviorManifest.header.uuid);
if (!behaviorDependsOnResource || !resourceDependsOnBehavior)
	throw new Error("Behavior and resource manifests must depend on each other.");

if (!behaviorManifest.modules.some(module => module.type === "script" && module.entry === "scripts/main.js"))
	throw new Error("Behavior pack must define scripts/main.js as its script entry point.");

const terrainTextures = new Set(Object.keys(terrainAtlas.texture_data ?? {}));
const itemTextures = new Set(Object.keys(itemAtlas.texture_data ?? {}));
for (const blockFile of await jsonFiles(resolve(bedrockRoot, "behavior_pack", "blocks"))) {
	const block = await readJson(blockFile);
	const components = block["minecraft:block"]?.components ?? {};
	const instances = [
		components["minecraft:material_instances"],
		components["minecraft:item_visual"]?.material_instances
	];
	for (const materialInstances of instances) {
		for (const instance of Object.values(materialInstances ?? {})) {
			const texture = instance?.texture;
			if (typeof texture === "string" && texture.startsWith("createbedrock_") && !terrainTextures.has(texture))
				throw new Error(`Block texture ${texture} in ${blockFile} is missing from terrain_texture.json.`);
		}
	}
}

for (const itemFile of await jsonFiles(resolve(bedrockRoot, "behavior_pack", "items"))) {
	const item = await readJson(itemFile);
	const icon = item["minecraft:item"]?.components?.["minecraft:icon"];
	if (typeof icon === "string" && icon.startsWith("createbedrock_") && !itemTextures.has(icon))
		throw new Error(`Item texture ${icon} in ${itemFile} is missing from item_texture.json.`);
}

for (const script of await filesWithExtension(resolve(bedrockRoot, "behavior_pack", "scripts"), ".js")) {
	const result = spawnSync(process.execPath, ["--check", script], { encoding: "utf8" });
	if (result.status !== 0)
		throw new Error(`Invalid JavaScript in ${script}: ${result.stderr || result.stdout}`);
}

console.log("Bedrock manifests, JSON files, and JavaScript syntax are valid.");
