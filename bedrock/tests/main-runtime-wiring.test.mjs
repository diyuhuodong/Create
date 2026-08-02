import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "behavior_pack", "scripts");

test("main passes a KineticWorld instance to display board and gauge runtimes", async () => {
	const source = await readFile(resolve(scriptsRoot, "main.js"), "utf8");
	assert.match(source, /registerDisplayBoards\(getKineticWorldForTesting\(\)\)/);
	assert.match(source, /registerGauges\(getKineticWorldForTesting\(\)\)/);
	assert.doesNotMatch(source, /register(?:DisplayBoards|Gauges)\(getKineticWorldForTesting\);/);
});
