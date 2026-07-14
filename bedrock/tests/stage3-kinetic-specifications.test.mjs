import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateStage3KineticSpecifications } from "../tools/stage3-kinetic-specification-schema.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(testDirectory, "..");

async function readJson(...parts) {
    return JSON.parse(await readFile(resolve(bedrockRoot, ...parts), "utf8"));
}

test("S3-9 kinetic specifications cover every queued record with local ownership", async () => {
    const [workQueue, specifications] = await Promise.all([
        readJson("data", "stage3-work-queue.json"),
        readJson("data", "stage3-kinetic-specifications.json")
    ]);
    const coverage = validateStage3KineticSpecifications(specifications, workQueue);

    assert.equal(coverage.entries, 33);
    assert.equal(specifications.entries.filter(entry => entry.deliveryState === "implemented").length, 27);
    assert.equal(specifications.entries.filter(entry => entry.deliveryState === "runtime_absorbed").length, 6);
    assert.equal(specifications.entries.filter(entry => entry.deliveryState === "handoff").length, 0);
    const steamEngine = specifications.entries.find(entry => entry.javaIdentifier === "create:steam_engine");
    const windmill = specifications.entries.find(entry => entry.javaIdentifier === "create:windmill_bearing");
    const gearshift = specifications.entries.find(entry => entry.acceptanceId === "KINETICS-GEARSHIFT-BLOCK_ENTITY");
    assert.equal(steamEngine.implementationPackage, "S3-9");
    assert.equal(windmill.implementationPackage, "S3-9");
    assert.equal(gearshift.deliveryState, "implemented");
});
