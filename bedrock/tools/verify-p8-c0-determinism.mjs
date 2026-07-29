import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { P8_INTEGRITY_DOCUMENTS } from "./p8-integrity-baseline.mjs";

const bedrockRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tracked = [...P8_INTEGRITY_DOCUMENTS.map(([, path]) => path), "data/p8-integrity-baseline.json"];

function rebuild() {
	const npm = process.platform === "win32" ? "npm.cmd" : "npm";
	const result = spawnSync(npm, ["run", "ledger"], { cwd: bedrockRoot, encoding: "utf8" });
	if (result.status !== 0)
		throw new Error(`P8 C0 ledger rebuild failed:\n${result.stdout}\n${result.stderr}`);
}

async function snapshot() {
	return Object.fromEntries(await Promise.all(tracked.map(async path => [path, await readFile(resolve(bedrockRoot, path), "utf8")])));
}

rebuild();
const first = await snapshot();
rebuild();
const second = await snapshot();
for (const path of tracked)
	if (first[path] !== second[path])
		throw new Error(`P8 C0 deterministic rebuild changed ${path} on the second run`);
console.log(`P8 C0 deterministic rebuild verified ${tracked.length} generated documents across two complete ledger runs.`);
