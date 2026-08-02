import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { hasRegisteredBlockComponent, normalizeBlockCustomComponents } from "../tools/block-custom-component-compatibility.mjs";

const scriptsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "behavior_pack", "scripts");

async function scriptFiles(directory = scriptsRoot) {
	const entries = await readdir(directory, { withFileTypes: true });
	const nested = await Promise.all(entries.map(entry => entry.isDirectory()
		? scriptFiles(resolve(directory, entry.name))
		: entry.name.endsWith(".js") ? [resolve(directory, entry.name)] : []));
	return nested.flat();
}

test("Bedrock runtime scripts use the current item event and import system before scheduling work", async () => {
	for (const file of await scriptFiles()) {
		const source = await readFile(file, "utf8");
		assert.doesNotMatch(source, /world\.afterEvents\.itemUseOn/, `${file} uses the removed itemUseOn event`);
		if (/\bsystem\./.test(source))
			assert.match(source, /import\s*\{[^}]*\bsystem\b[^}]*\}\s*from\s*["']@minecraft\/server["']/, `${file} uses system without importing it`);
	}
});

test("Bedrock persistent runtimes defer world restoration until after early execution", async () => {
	for (const file of await scriptFiles()) {
		const source = await readFile(file, "utf8");
		assert.doesNotMatch(source, /^\s*restore\(\);/m, `${file} restores world state during early execution`);
	}
});

test("Bedrock packages registered block runtimes through the current custom-component declaration", () => {
	const definition = {
		"minecraft:block": {
			components: {
				"minecraft:custom_components": ["createbedrock:bell_runtime"],
				"createbedrock:bell_runtime": {},
				"createbedrock:redstone_input": {},
				"minecraft:redstone_consumer": { min_power: 0 }
			}
		}
	};
	assert.deepEqual(normalizeBlockCustomComponents(definition), [
		"createbedrock:redstone_input",
		"createbedrock:bell_runtime"
	]);
	const components = definition["minecraft:block"].components;
	assert.deepEqual(components["minecraft:custom_components"], [
		"createbedrock:bell_runtime",
		"createbedrock:redstone_input"
	]);
	assert.equal(hasRegisteredBlockComponent(components, "createbedrock:redstone_input"), true);
	assert.equal(Object.hasOwn(components, "createbedrock:redstone_input"), false);
});
