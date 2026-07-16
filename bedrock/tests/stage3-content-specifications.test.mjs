import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateStage3ContentSpecifications } from "../tools/stage3-content-specification-schema.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(testDirectory, "..");

async function readJson(...parts) {
    return JSON.parse(await readFile(resolve(bedrockRoot, ...parts), "utf8"));
}

test("S3-8B content specifications cover every queued content record with source evidence and an implementation owner", async () => {
    const [workQueue, specifications] = await Promise.all([
        readJson("data", "stage3-work-queue.json"),
        readJson("data", "stage3-content-specifications.json")
    ]);
    const coverage = validateStage3ContentSpecifications(specifications, workQueue);

	assert.equal(coverage.entries, 110);
	for (const identifier of ["table_cloth", "super_glue", "linear_chassis", "tree_fertilizer", "handheld_worldshaper", "copycat_panel", "potato_projectile", "mechanical_crafter", "mechanical_plough", "mechanical_roller", "piston_extension_pole", "portable_storage_interface", "clockwork_bearing"])
		assert.equal(specifications.entries.some(entry => entry.javaIdentifier === `create:${identifier}`), true);
});
