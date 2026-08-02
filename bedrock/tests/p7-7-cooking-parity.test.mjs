import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { CookingParityMachine } from "../behavior_pack/scripts/processing/cooking-parity-machine.js";
import { inspectNativeCookingBridge } from "../behavior_pack/scripts/processing/native-cooking-bridge.js";
import { buildP77CookingParityCatalog, renderP77CookingParityRecipes, validateP77CookingParityCatalog } from "../tools/p7-7-cooking-parity.mjs";
import { normalizeLineEndings } from "./test-text.mjs";

const bedrockRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function json(path) {
	return JSON.parse(await readFile(path, "utf8"));
}

async function catalog() {
	return json(resolve(bedrockRoot, "data", "p7-7-cooking-parity.json"));
}

test("P7.7 cooking catalog tracks all native timing and experience gaps", async () => {
	const [nativeRecipes, actual] = await Promise.all([
		json(resolve(bedrockRoot, "data", "recipes", "native.json")),
		catalog()
	]);
	const expected = buildP77CookingParityCatalog(nativeRecipes);
	assert.deepEqual(actual, expected);
	assert.deepEqual(validateP77CookingParityCatalog(actual), {
		experienceOverrides: 12,
		processingTimeOverrides: 16,
		recipes: 22
	});
	assert.equal(normalizeLineEndings(await readFile(resolve(bedrockRoot, "behavior_pack", "scripts", "processing", "generated", "cooking-parity-recipes.js"), "utf8")), renderP77CookingParityRecipes(actual));
});

test("CookingParityMachine preserves exact timing, output, and one experience claim", async () => {
	const recipes = (await catalog()).recipes;
	const recipe = recipes.find(entry => entry.sourceId === "create:blasting/copper_ingot_from_crushed");
	const machine = new CookingParityMachine([recipe], { id: "test:copper" });
	assert.equal(machine.insertInput({ count: 1, typeId: recipe.input }).accepted.count, 1);
	assert.equal(machine.tick({ station: "blast_furnace" }).started, true);
	assert.equal(machine.tick({ station: "blast_furnace", workUnits: recipe.processingTicks - 1 }).completed, false);
	assert.equal(machine.tick({ station: "blast_furnace" }).completed, true);
	assert.equal(machine.tick({ station: "blast_furnace" }).delivered, true);
	const output = machine.extractOutput({ claimerId: "player-a" });
	assert.deepEqual(output.stack, { count: 1, typeId: recipe.output });
	assert.deepEqual(machine.claimExperience({ claimerId: "player-a", operationId: output.operationId, receiptId: "xp-1" }), {
		amount: recipe.experience,
		operationId: output.operationId,
		replay: false
	});
	assert.deepEqual(machine.claimExperience({ claimerId: "player-a", operationId: output.operationId, receiptId: "xp-1" }), {
		amount: 0,
		operationId: output.operationId,
		replay: true
	});
	assert.equal(machine.claimExperience({ claimerId: "player-b", operationId: output.operationId, receiptId: "xp-2" }), undefined);
});

test("CookingParityMachine restores in-flight work and rejects premature experience", async () => {
	const recipes = (await catalog()).recipes;
	const recipe = recipes.find(entry => entry.sourceId === "create:campfire_cooking/bread");
	const machine = new CookingParityMachine([recipe], { id: "test:bread" });
	machine.insertInput({ count: 1, typeId: recipe.input });
	machine.tick({ station: "campfire" });
	machine.tick({ station: "campfire", workUnits: 123 });
	const restored = new CookingParityMachine([recipe], { id: "test:bread" });
	restored.restore(machine.snapshot());
	assert.equal(restored.claimExperience({ claimerId: "player-a", operationId: 0, receiptId: "premature" }), undefined);
	assert.equal(restored.tick({ station: "campfire", workUnits: recipe.processingTicks - 123 }).completed, true);
	restored.tick({ station: "campfire" });
	assert.equal(restored.extractOutput({ claimerId: "player-a" }).stack.typeId, recipe.output);
});

test("CookingParityMachine restores a completed pending output without losing its experience", async () => {
	const recipe = (await catalog()).recipes.find(entry => entry.sourceId === "create:smelting/iron_ingot_from_crushed");
	const machine = new CookingParityMachine([recipe], { id: "test:pending" });
	machine.insertInput({ count: 1, typeId: recipe.input });
	machine.tick({ station: "furnace" });
	machine.tick({ station: "furnace", workUnits: recipe.processingTicks });
	const restored = new CookingParityMachine([recipe], { id: "test:pending" });
	restored.restore(machine.snapshot());
	assert.equal(restored.tick({ station: "furnace" }).delivered, true);
	const output = restored.extractOutput({ claimerId: "player-a" });
	assert.equal(output.stack.typeId, recipe.output);
	assert.equal(restored.claimExperience({ claimerId: "player-a", operationId: output.operationId, receiptId: "pending-xp" }).amount, recipe.experience);
});

test("native cooking bridge remains fail-closed until every platform capability is available", () => {
	const missing = inspectNativeCookingBridge({ observeStation() {} });
	assert.equal(missing.supported, false);
	assert.ok(missing.missing.includes("awardExperience"));
	const bridge = Object.fromEntries(["observeStation", "reserveInput", "readProgress", "restoreInput", "writeOutput", "writeProgress", "awardExperience"].map(name => [name, () => {}]));
	assert.deepEqual(inspectNativeCookingBridge(bridge), { missing: [], state: "supported", supported: true });
});
