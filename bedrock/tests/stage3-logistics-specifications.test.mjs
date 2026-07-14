import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateStage3LogisticsSpecifications } from "../tools/stage3-logistics-specification-schema.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(testDirectory, "..");

async function readJson(...parts) {
	return JSON.parse(await readFile(resolve(bedrockRoot, ...parts), "utf8"));
}

test("S3-10 logistics specifications cover every queued record with durable local ownership", async () => {
	const [workQueue, specifications] = await Promise.all([
		readJson("data", "stage3-work-queue.json"),
		readJson("data", "stage3-logistics-specifications.json")
	]);
	const coverage = validateStage3LogisticsSpecifications(specifications, workQueue);

	assert.equal(coverage.entries, 26);
	assert.equal(specifications.entries.filter(entry => entry.deliveryState === "implemented").length, 15);
	assert.equal(specifications.entries.filter(entry => entry.deliveryState === "runtime_absorbed").length, 11);
	assert.equal(specifications.entries.find(entry => entry.javaIdentifier === "create:belt" && entry.kind === "block")?.implementationPackage, "S3-10");
	assert.equal(specifications.entries.find(entry => entry.acceptanceId === "LOGISTICS-FUNNEL-BLOCK_ENTITY")?.deliveryState, "runtime_absorbed");
});
