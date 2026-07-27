import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildP73RecipeExecutionLedger, validateP73RecipeExecutionLedger } from "../tools/p7-3-recipe-execution-ledger.mjs";

const bedrockRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("P7.3 recipe execution ledger distinguishes complete routes from an unbound sequenced-assembly controller", async () => {
	const generated = await buildP73RecipeExecutionLedger({ bedrockRoot });
	assert.deepEqual(validateP73RecipeExecutionLedger(generated), { entries: 1884, staticCovered: 1366 });
	assert.deepEqual(generated.summary, {
		external_compatibility: 515,
		native_recipe: 983,
		runtime_adapter_pending: 3,
		runtime_cooking_bridge: 22,
		runtime_machine: 171,
		scripted_interaction: 190
	});
	assert.deepEqual(Object.fromEntries([...new Set(generated.entries.filter(entry => entry.execution === "runtime_machine").map(entry => entry.processor))].sort()
		.map(processor => [processor, generated.entries.filter(entry => entry.processor === processor).length])), {
		"create:compacting": 7,
		"create:crushing": 55,
		"create:cutting": 2,
		"create:haunting": 20,
		"create:mechanical_crafting": 4,
		"create:milling": 47,
		"create:mixing": 11,
		"create:pressing": 8,
		"create:splashing": 17
	});
	assert.equal(generated.entries.filter(entry => entry.execution === "runtime_machine").every(entry => entry.evidence.length === 2 && entry.processor !== undefined), true);
	assert.equal(generated.entries.filter(entry => entry.execution === "runtime_cooking_bridge").every(entry => entry.platformVerification === "pending_windows_bedrock"), true);
	assert.deepEqual(generated.entries.filter(entry => entry.execution === "runtime_adapter_pending").map(entry => entry.sourceId), [
		"create:sequenced_assembly/precision_mechanism",
		"create:sequenced_assembly/sturdy_sheet",
		"create:sequenced_assembly/track"
	]);
	const committed = JSON.parse(await readFile(resolve(bedrockRoot, "data/p7-3-recipe-execution-ledger.json"), "utf8"));
	assert.deepEqual(committed, generated);
});
