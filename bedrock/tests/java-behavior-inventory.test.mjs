import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildJavaBehaviorInventory, validateJavaBehaviorInventory } from "../tools/java-behavior-inventory.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(testDirectory, "..");
const repositoryRoot = resolve(bedrockRoot, "..");

test("Java behavior inventory covers content, worldgen, and behavior registration hooks", async () => {
	const inventory = await buildJavaBehaviorInventory({ repositoryRoot });
	assert.deepEqual(validateJavaBehaviorInventory(inventory), {
		entries: 1319,
		areas: inventory.summary.areas,
		status: inventory.summary.status,
		total: 1319
	});
	const sourceKeys = new Set(inventory.entries.map(entry => entry.sourceKey));
	for (const sourceKey of [
		"behavior:src/main/java/com/simibubi/create/content/kinetics/TorquePropagator.java",
		"behavior:src/main/java/com/simibubi/create/content/trains/GlobalRailwayManager.java",
		"behavior:src/main/java/com/simibubi/create/infrastructure/worldgen/AllFeatures.java",
		"behavior:src/main/java/com/simibubi/create/AllMovementBehaviours.java"
	])
		assert.ok(sourceKeys.has(sourceKey), `behavior inventory is missing ${sourceKey}`);
	assert.equal(inventory.summary.status.audit_pending ?? 0, 0);
	assert.equal(inventory.summary.status.implementation_required ?? 0, 0);
	assert.equal(inventory.entries.filter(entry => entry.status === "equivalent").length, 945);
	assert.equal(inventory.entries.filter(entry => entry.status === "implemented_with_documented_difference").length, 329);
	assert.equal(inventory.entries.filter(entry => entry.status === "not_applicable").length, 45);
	assert.equal(new Set(inventory.entries.flatMap(entry => entry.evidence.platformScenarios)).size, inventory.entries.length);
	for (const entry of inventory.entries) {
		assert.ok(entry.contract.includes(entry.source));
		assert.ok(entry.rationale.length > 0);
		for (const path of [...entry.evidence.bedrockRuntime, ...entry.evidence.staticTests])
			await readFile(resolve(bedrockRoot, path), "utf8");
	}
	const generated = await readFile(resolve(bedrockRoot, "data", "java-behavior-inventory.json"), "utf8").then(JSON.parse);
	assert.deepEqual(generated, inventory);
});

test("Java behavior inventory rejects duplicate source evidence", async () => {
	const inventory = await buildJavaBehaviorInventory({ repositoryRoot });
	const duplicate = structuredClone(inventory);
	duplicate.entries.push(structuredClone(duplicate.entries[0]));
	assert.throws(() => validateJavaBehaviorInventory(duplicate), /duplicate or unstable key/);
});
