import { mkdir, rm, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(toolDirectory, "..");
const buildRoot = resolve(bedrockRoot, "build");
const distributionRoot = resolve(bedrockRoot, "dist");
const archive = resolve(distributionRoot, "createbedrock-0.1.0.mcaddon");

await stat(buildRoot);
await mkdir(distributionRoot, { recursive: true });
await rm(archive, { force: true });

const result = process.platform === "win32"
	? spawnSync("powershell.exe", ["-NoProfile", "-Command", `Compress-Archive -Path behavior_pack,resource_pack -DestinationPath '${archive}' -Force`], { cwd: buildRoot, stdio: "inherit" })
	: spawnSync("zip", ["-q", "-r", archive, "behavior_pack", "resource_pack"], { cwd: buildRoot, stdio: "inherit" });

if (result.status !== 0)
	throw new Error("Unable to create the .mcaddon archive. Run npm run build first and ensure the platform archive tool is available.");

console.log(`Packed ${archive}`);
