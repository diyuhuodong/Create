import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateStage5WorkQueue } from "../tools/stage5-work-queue-schema.mjs";

const bedrockRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("Stage-5 work queue assigns every train and package entry to its implementation package", async () => {
	const [matrix, queue] = await Promise.all([
		readFile(resolve(bedrockRoot, "data", "migration-matrix.json"), "utf8").then(JSON.parse),
		readFile(resolve(bedrockRoot, "data", "stage5-work-queue.json"), "utf8").then(JSON.parse)
	]);
	const coverage = validateStage5WorkQueue(queue, matrix);
	assert.equal(coverage.entries, 25);
	assert.deepEqual(coverage.deliveryCounts, {
		"completed:P5.1": 6,
		"completed:P5.2": 7,
		"completed:P5.3": 6,
		"completed:P5.4": 6
	});
	assert.match(queue.entries.find(entry => entry.acceptanceId === "TRAINS-TRACK-SIGNAL-BLOCK").behaviorPlan, /sole owner/i);
	assert.match(queue.entries.find(entry => entry.acceptanceId === "LOGISTICS-PACKAGE-ENTITY").persistencePlan, /package identity/i);
});
