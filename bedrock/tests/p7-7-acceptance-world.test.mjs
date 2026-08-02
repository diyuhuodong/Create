import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { AcceptanceWorldState } from "../behavior_pack/scripts/acceptance/acceptance-world-state.js";
import { buildP77AcceptanceWorldLayout, renderP77AcceptanceWorldLayout, validateP77AcceptanceWorldLayout } from "../tools/p7-7-acceptance-world.mjs";
import { normalizeLineEndings } from "./test-text.mjs";

const bedrockRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function json(path) {
	return JSON.parse(await readFile(path, "utf8"));
}

test("P7.7 acceptance world covers every scenario with ten non-overlapping zones", async () => {
	const [catalog, actual] = await Promise.all([
		json(resolve(bedrockRoot, "data", "p7-7-scenario-catalog.json")),
		json(resolve(bedrockRoot, "data", "p7-7-acceptance-world.json"))
	]);
	const expected = buildP77AcceptanceWorldLayout(catalog);
	assert.deepEqual(actual, expected);
	assert.deepEqual(validateP77AcceptanceWorldLayout(actual, catalog), { checkpoints: 4, scenarios: 18, zones: 10 });
	assert.equal(normalizeLineEndings(await readFile(resolve(bedrockRoot, "behavior_pack", "scripts", "acceptance", "generated", "acceptance-world-layout.js"), "utf8")), renderP77AcceptanceWorldLayout(actual));
});

test("P7.7 acceptance checkpoints advance only from W0 through W3 and fail closed for absent providers", async () => {
	const layout = await json(resolve(bedrockRoot, "data", "p7-7-acceptance-world.json"));
	const state = new AcceptanceWorldState(layout);
	assert.equal(state.checkpoint("W1").reason, "invalid_transition");
	assert.equal(state.setup({ kernel: { failed: 0 } }).complete, true);
	const incomplete = state.checkpoint("W1", { kernel: { failed: 0 } });
	assert.equal(incomplete.ok, true);
	assert.equal(incomplete.complete, false);
	const required = Object.fromEntries(layout.checkpoints.find(checkpoint => checkpoint.id === "W2").requiredSnapshotProviders.map(id => [id, { id, stable: true }]));
	assert.equal(state.checkpoint("W2", required).complete, true);
	assert.equal(state.checkpoint("W3", required).complete, true);
	const restored = new AcceptanceWorldState(layout);
	restored.restore(state.snapshot());
	assert.equal(restored.status().activeCheckpoint, "W3");
});
