import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, stat } from "node:fs/promises";
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

function runArchive(command, args, options) {
	const result = spawnSync(command, args, { ...options, stdio: "inherit" });
	if (result.status !== 0)
		throw new Error("Unable to create the .mcaddon archive. Run npm run build first and ensure the platform archive tool is available.");
}

async function createArchiveFile(buildRoot, archive) {
	const behaviorArchive = "createbedrock-behavior.mcpack";
	const resourceArchive = "createbedrock-resource.mcpack";
	const behaviorPath = resolve(buildRoot, behaviorArchive);
	const resourcePath = resolve(buildRoot, resourceArchive);
	const behaviorZip = `${behaviorPath}.zip`;
	const resourceZip = `${resourcePath}.zip`;
	const archiveZip = `${archive}.zip`;
	const [behaviorEntries, resourceEntries] = await Promise.all([
		readdir(resolve(buildRoot, "behavior_pack")),
		readdir(resolve(buildRoot, "resource_pack"))
	]);
	try {
		if (process.platform === "win32") {
			runArchive("tar", ["-a", "-c", "-f", behaviorZip, "-C", "behavior_pack", ...behaviorEntries], { cwd: buildRoot });
			await rename(behaviorZip, behaviorPath);
			runArchive("tar", ["-a", "-c", "-f", resourceZip, "-C", "resource_pack", ...resourceEntries], { cwd: buildRoot });
			await rename(resourceZip, resourcePath);
			runArchive("tar", ["-a", "-c", "-f", archiveZip, behaviorArchive, resourceArchive], { cwd: buildRoot });
			await rename(archiveZip, archive);
		} else {
			runArchive("zip", ["-q", "-r", behaviorPath, ...behaviorEntries], { cwd: resolve(buildRoot, "behavior_pack") });
			runArchive("zip", ["-q", "-r", resourcePath, ...resourceEntries], { cwd: resolve(buildRoot, "resource_pack") });
			runArchive("zip", ["-q", archive, behaviorArchive, resourceArchive], { cwd: buildRoot });
		}
	} finally {
		await Promise.all([behaviorPath, resourcePath, behaviorZip, resourceZip, archiveZip].map(file => rm(file, { force: true })));
	}
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
	await createArchiveFile(buildRoot, temporary);
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
