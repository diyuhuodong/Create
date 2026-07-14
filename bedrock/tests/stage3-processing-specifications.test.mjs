import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateStage3ProcessingSpecifications } from "../tools/stage3-processing-specification-schema.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(testDirectory, "..");

async function readJson(...parts) {
	return JSON.parse(await readFile(resolve(bedrockRoot, ...parts), "utf8"));
}

test("S3-11 processing specifications cover every queued record with persistent runtime ownership", async () => {
	const [workQueue, specifications] = await Promise.all([
		readJson("data", "stage3-work-queue.json"),
		readJson("data", "stage3-processing-specifications.json")
	]);
	const coverage = validateStage3ProcessingSpecifications(specifications, workQueue);
	assert.equal(coverage.entries, 8);
	assert.equal(specifications.entries.filter(entry => entry.deliveryState === "implemented").length, 4);
	assert.equal(specifications.entries.filter(entry => entry.deliveryState === "runtime_absorbed").length, 4);
	assert.match(specifications.entries.find(entry => entry.acceptanceId === "PROCESSING-ENCASED-FAN-BLOCK")?.recipeBoundary, /runtime recipe registry/i);
	assert.equal(specifications.entries.find(entry => entry.acceptanceId === "PROCESSING-SAW-BLOCK_ENTITY")?.deliveryState, "runtime_absorbed");
});
