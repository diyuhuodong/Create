import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { validateStage6WorkQueue } from "../tools/stage6-work-queue-schema.mjs";

const root = resolve(import.meta.dirname, "..");

test("Stage-6 work queue maps every equipment matrix record to one delivery package", async () => {
	const [matrixText, queueText] = await Promise.all([
		readFile(resolve(root, "data", "migration-matrix.json"), "utf8"),
		readFile(resolve(root, "data", "stage6-work-queue.json"), "utf8")
	]);
	const coverage = validateStage6WorkQueue(JSON.parse(queueText), JSON.parse(matrixText));
	assert.equal(coverage.entries, 16);
	assert.deepEqual(coverage.deliveryCounts, {
		"completed:P6.1": 11,
		"completed:P6.2": 3,
		"completed:P6.3": 1,
		"completed:P6.4": 1
	});
});
