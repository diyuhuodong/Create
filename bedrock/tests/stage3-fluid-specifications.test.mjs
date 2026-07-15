import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateStage3FluidSpecifications } from "../tools/stage3-fluid-specification-schema.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(testDirectory, "..");

async function readJson(...parts) {
	return JSON.parse(await readFile(resolve(bedrockRoot, ...parts), "utf8"));
}

test("S3-12 fluid specifications cover every queued record with persistent runtime ownership", async () => {
	const [workQueue, specifications] = await Promise.all([
		readJson("data", "stage3-work-queue.json"),
		readJson("data", "stage3-fluid-specifications.json")
	]);
	const coverage = validateStage3FluidSpecifications(specifications, workQueue);
	assert.equal(coverage.entries, 18);
	assert.equal(specifications.entries.filter(entry => entry.deliveryState === "implemented").length, 9);
	assert.equal(specifications.entries.filter(entry => entry.deliveryState === "runtime_absorbed").length, 9);
	assert.match(specifications.entries.find(entry => entry.acceptanceId === "FLUIDS-COPPER-VALVE-HANDLE-BLOCK")?.resourceBoundary, /OBJ/i);
	assert.match(specifications.entries.find(entry => entry.acceptanceId === "FLUIDS-PORTABLE-FLUID-INTERFACE-BLOCK")?.behaviorBoundary, /contraption attachment is deferred/i);
});
