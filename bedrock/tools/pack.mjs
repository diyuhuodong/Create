import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const defaultBedrockRoot = resolve(toolDirectory, "..");

export async function sha256File(file) {
	const hash = createHash("sha256");
	for await (const chunk of createReadStream(file))
		hash.update(chunk);
	return hash.digest("hex");
}

function packVersion(manifest) {
	const version = manifest.header?.version;
	if (!Array.isArray(version) || version.length !== 3 || !version.every(part => Number.isInteger(part) && part >= 0))
		throw new Error("Behavior-pack manifest requires a three-part non-negative version");
	return version.join(".");
}

function createArchiveFile(buildRoot, archive) {
	const behaviorArchive = "createbedrock-behavior.mcpack";
	const resourceArchive = "createbedrock-resource.mcpack";
	const result = process.platform === "win32"
		? spawnSync("powershell.exe", [
			"-NoProfile",
			"-Command",
			`$ErrorActionPreference = 'Stop'\nCompress-Archive -Path 'behavior_pack\\*' -DestinationPath '${`${behaviorArchive}.zip`}' -Force\nMove-Item -LiteralPath '${`${behaviorArchive}.zip`}' -Destination '${behaviorArchive}' -Force\nCompress-Archive -Path 'resource_pack\\*' -DestinationPath '${`${resourceArchive}.zip`}' -Force\nMove-Item -LiteralPath '${`${resourceArchive}.zip`}' -Destination '${resourceArchive}' -Force\nCompress-Archive -Path '${behaviorArchive}','${resourceArchive}' -DestinationPath '${`${archive}.zip`.replaceAll("'", "''")}' -Force\nMove-Item -LiteralPath '${`${archive}.zip`.replaceAll("'", "''")}' -Destination '${archive.replaceAll("'", "''")}' -Force\nRemove-Item -LiteralPath '${behaviorArchive}','${resourceArchive}' -Force`
		], { cwd: buildRoot, stdio: "inherit" })
		: spawnSync("sh", ["-c", `cd behavior_pack && zip -q -r ../${behaviorArchive} . && cd ../resource_pack && zip -q -r ../${resourceArchive} . && cd .. && zip -q ${archive} ${behaviorArchive} ${resourceArchive} && rm -f ${behaviorArchive} ${resourceArchive}`], { cwd: buildRoot, stdio: "inherit" });
	if (result.status !== 0)
		throw new Error("Unable to create the .mcaddon archive. Run npm run build first and ensure the platform archive tool is available.");
}

export async function createPackArchive({ bedrockRoot = defaultBedrockRoot } = {}) {
	const buildRoot = resolve(bedrockRoot, "build");
	const distributionRoot = resolve(bedrockRoot, "dist");
	await stat(resolve(buildRoot, "behavior_pack"));
	await stat(resolve(buildRoot, "resource_pack"));
	const manifest = JSON.parse(await readFile(resolve(buildRoot, "behavior_pack", "manifest.json"), "utf8"));
	const version = packVersion(manifest);
	await mkdir(distributionRoot, { recursive: true });
	const temporary = resolve(distributionRoot, `createbedrock-${version}.tmp.mcaddon`);
	await rm(temporary, { force: true });
	createArchiveFile(buildRoot, temporary);
	const sha256 = await sha256File(temporary);
	const archive = resolve(distributionRoot, `createbedrock-${version}-${sha256.slice(0, 12)}.mcaddon`);
	await rm(archive, { force: true });
	await rename(temporary, archive);
	const details = await stat(archive);
	const repositoryRoot = resolve(bedrockRoot, "..");
	return {
		archive,
		path: relative(repositoryRoot, archive).split(sep).join("/"),
		sha256,
		sizeBytes: details.size,
		version
	};
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
	const artifact = await createPackArchive();
	console.log(`Packed ${artifact.path} (${artifact.sha256}, ${artifact.sizeBytes} bytes)`);
}
