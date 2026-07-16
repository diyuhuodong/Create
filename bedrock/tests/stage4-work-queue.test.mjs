import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateStage4WorkQueue } from "../tools/stage4-work-queue-schema.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(testDirectory, "..");

async function readJson(...parts) {
	return JSON.parse(await readFile(resolve(bedrockRoot, ...parts), "utf8"));
}

test("Stage-4 work queue assigns every dynamic-mechanics and schematic entry to one implementation package", async () => {
	const [matrix, queue] = await Promise.all([
		readJson("data", "migration-matrix.json"),
		readJson("data", "stage4-work-queue.json")
	]);
	const coverage = validateStage4WorkQueue(queue, matrix);
	assert.equal(coverage.entries, 54);
	assert.deepEqual(coverage.deliveryCounts, {
		"completed:P4.1": 4,
		"completed:P4.2": 15,
		"completed:P4.3": 4,
		"completed:P4.4": 8,
		"completed:P4.5": 9,
		"completed:P4.6": 2,
		"P4.7": 12
	});
	const piston = queue.entries.find(entry => entry.acceptanceId === "CONTRAPTIONS-MECHANICAL-PISTON-BLOCK");
	assert.equal(piston.deliveryPackage, "completed:P4.2");
	assert.match(piston.behaviorPlan, /swept occupancy/i);
	const schematicannon = queue.entries.find(entry => entry.acceptanceId === "SCHEMATICS-SCHEMATICANNON-BLOCK_ENTITY");
	assert.equal(schematicannon.deliveryPackage, "P4.7");
	assert.match(schematicannon.persistencePlan, /reservation journal/i);
});
