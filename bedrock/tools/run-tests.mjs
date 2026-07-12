import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(toolDirectory, "..");

async function findTests(directory) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const file = resolve(directory, entry.name);
		if (entry.isDirectory())
			files.push(...await findTests(file));
		else if (entry.name.endsWith(".test.mjs"))
			files.push(file);
	}
	return files;
}

const testFiles = await findTests(resolve(bedrockRoot, "tests"));
if (testFiles.length === 0)
	throw new Error("No Node test files were found.");

const result = spawnSync(process.execPath, ["--test", ...testFiles], { stdio: "inherit" });
process.exitCode = result.status ?? 1;
