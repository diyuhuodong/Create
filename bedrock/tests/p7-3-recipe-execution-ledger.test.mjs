import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildP73RecipeExecutionLedger, validateP73RecipeExecutionLedger } from "../tools/p7-3-recipe-execution-ledger.mjs";

const bedrockRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("P7.3 recipe execution ledger closes every Java recipe with a concrete Bedrock execution route", async () => {
	const generated = await buildP73RecipeExecutionLedger({ bedrockRoot });
	assert.deepEqual(validateP73RecipeExecutionLedger(generated), { entries: 1884, staticCovered: 1369 });
	assert.deepEqual(generated.summary, {
		external_compatibility: 515,
		native_recipe: 983,
		runtime_cooking_bridge: 22,
		runtime_machine: 171,
		scripted_interaction: 193
	});
	assert.equal(generated.entries.filter(entry => entry.execution === "runtime_cooking_bridge").every(entry => entry.platformVerification === "pending_windows_bedrock"), true);
	const committed = JSON.parse(await readFile(resolve(bedrockRoot, "data/p7-3-recipe-execution-ledger.json"), "utf8"));
	assert.deepEqual(committed, generated);
});
