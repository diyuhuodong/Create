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
    const crafter = specifications.entries.find(entry => entry.javaIdentifier === "create:mechanical_crafter" && entry.kind === "block");
    const sail = specifications.entries.find(entry => entry.javaIdentifier === "create:white_sail");
    const alloyLadder = specifications.entries.find(entry => entry.javaIdentifier === "create:andesite_ladder");
    assert.equal(crafter.implementationPackage, "S3-11");
    assert.equal(sail.implementationPackage, "S4");
    assert.equal(alloyLadder.acquisitionConclusion, "vanilla_recipe_candidate");
    assert.ok(alloyLadder.sourceRecipePaths.length > 0);
});
