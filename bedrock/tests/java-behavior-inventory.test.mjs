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
		status: { audit_pending: 1319 },
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
	assert.ok(inventory.entries.every(entry => entry.evidence.bedrockRuntime.length === 0
		&& entry.evidence.staticTests.length === 0
		&& entry.evidence.platformScenarios.length === 0));
	const generated = await readFile(resolve(bedrockRoot, "data", "java-behavior-inventory.json"), "utf8").then(JSON.parse);
	assert.deepEqual(generated, inventory);
});

test("Java behavior inventory rejects duplicate source evidence", async () => {
	const inventory = await buildJavaBehaviorInventory({ repositoryRoot });
	const duplicate = structuredClone(inventory);
	duplicate.entries.push(structuredClone(duplicate.entries[0]));
	assert.throws(() => validateJavaBehaviorInventory(duplicate), /duplicate or unstable key/);
});
