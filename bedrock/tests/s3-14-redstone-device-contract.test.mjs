import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateStage3RedstoneDeviceSourceContract } from "../tools/s3-14-redstone-device-contract.mjs";

const testDirectory = fileURLToPath(new URL(".", import.meta.url));
const bedrockRoot = resolve(testDirectory, "..");

test("S3-14 redstone contract requires source behavior, native components, recipes, drops, translations, and every mapped acceptance ID", async () => {
	assert.deepEqual(await validateStage3RedstoneDeviceSourceContract({ bedrockRoot }), {
		acceptanceIds: 29,
		blocks: 16,
		items: 1
	});
});
