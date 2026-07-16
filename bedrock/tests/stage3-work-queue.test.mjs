import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateStage3WorkQueue } from "../tools/stage3-work-queue-schema.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(testDirectory, "..");

async function readJson(...parts) {
    return JSON.parse(await readFile(resolve(bedrockRoot, ...parts), "utf8"));
}

test("Stage-3 work queue covers every matrix entry exactly once and preserves delivery boundaries", async () => {
    const [matrix, queue] = await Promise.all([
        readJson("data", "migration-matrix.json"),
        readJson("data", "stage3-work-queue.json")
    ]);
    const coverage = validateStage3WorkQueue(queue, matrix);

    assert.equal(coverage.entries, 245);
    assert.deepEqual(coverage.deliveryCounts, {
		"completed:S3-7": 15,
		"completed:S3-9": 33,
		"completed:S3-10": 26,
        "S3-11": 8,
        "S3-12": 18,
        "S3-14": 29,
        "S3-8A": 6,
        "S3-8B": 110,
    });
    const zincOre = queue.entries.find(entry => entry.acceptanceId === "CONTENT-ZINC-ORE-BLOCK");
    assert.equal(zincOre.deliveryPackage, "S3-8A");
    assert.match(zincOre.lootPlan, /raw-zinc/i);
	const analogLever = queue.entries.find(entry => entry.acceptanceId === "REDSTONE-ANALOG-LEVER-BLOCK");
	assert.equal(analogLever.deliveryPackage, "S3-14");
	assert.equal(analogLever.blocker, null);
	assert.equal(analogLever.matrixStatus, "implementation_in_progress");
});
