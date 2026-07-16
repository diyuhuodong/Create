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

    assert.equal(coverage.entries, 0);
    assert.equal(specifications.entries.some(entry => entry.javaIdentifier === "create:table_cloth"), false);
    assert.equal(specifications.entries.some(entry => entry.javaIdentifier === "create:super_glue"), false);
    assert.equal(specifications.entries.some(entry => entry.javaIdentifier === "create:linear_chassis"), false);
    assert.equal(specifications.entries.some(entry => entry.javaIdentifier === "create:tree_fertilizer"), false);
    assert.equal(specifications.entries.some(entry => entry.javaIdentifier === "create:handheld_worldshaper"), false);
    assert.equal(specifications.entries.some(entry => entry.javaIdentifier === "create:copycat_panel"), false);
    assert.equal(specifications.entries.some(entry => entry.javaIdentifier === "create:potato_projectile"), false);
    assert.equal(specifications.entries.some(entry => entry.javaIdentifier === "create:mechanical_crafter"), false);
    assert.equal(specifications.entries.some(entry => entry.javaIdentifier === "create:mechanical_plough"), false);
    assert.equal(specifications.entries.some(entry => entry.javaIdentifier === "create:mechanical_roller"), false);
    assert.equal(specifications.entries.some(entry => entry.javaIdentifier === "create:piston_extension_pole"), false);
    assert.equal(specifications.entries.some(entry => entry.javaIdentifier === "create:portable_storage_interface"), false);
    assert.equal(specifications.entries.some(entry => entry.javaIdentifier === "create:clockwork_bearing"), false);
});
