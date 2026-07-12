import { cp, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const developmentRoot = process.env.BEDROCK_DEV_ROOT;
if (!developmentRoot)
	throw new Error("Set BEDROCK_DEV_ROOT to the Windows com.mojang development root before deploying.");

const toolDirectory = resolve(fileURLToPath(new URL(".", import.meta.url)));
const buildRoot = resolve(toolDirectory, "..", "build");

await stat(buildRoot);

const destinations = [
	["behavior_pack", "development_behavior_packs"],
	["resource_pack", "development_resource_packs"]
];

for (const [sourceName, destinationDirectory] of destinations) {
	const source = resolve(buildRoot, sourceName);
	const destination = resolve(developmentRoot, destinationDirectory, "createbedrock");
	await rm(destination, { force: true, recursive: true });
	await cp(source, destination, { recursive: true });
}

console.log("Deployed Create Bedrock packs to the Windows development directories.");
