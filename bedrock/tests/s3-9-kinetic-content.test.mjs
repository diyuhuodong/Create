import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateStage3KineticSourceContract } from "../tools/stage3-kinetic-contract.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(testDirectory, "..");

test("S3-9 delivered kinetic blocks have a runnable resource, explicit self-drop, durable controls, and runtime registration", async () => {
    assert.deepEqual(await validateStage3KineticSourceContract({ bedrockRoot }), {
        blocks: 17,
        directRecipes: 15,
        generatedStructures: 1,
        redstoneControlledBlocks: 3,
        runtimeAbsorbed: 6,
        runtimeBoundaries: 5,
        staticRecords: 33
    });
});
