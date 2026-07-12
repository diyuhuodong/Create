import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

console.log("Bedrock manifests and JSON files are valid.");
