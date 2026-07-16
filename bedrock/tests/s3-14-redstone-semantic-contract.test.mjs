import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { validateStage3RedstoneSemanticContract } from "../tools/s3-14-redstone-semantic-contract.mjs";

const bedrockRoot = resolve(import.meta.dirname, "..");

test("S3-14 semantic contract traces every code-complete redstone device without claiming platform acceptance", async () => {
	assert.deepEqual(await validateStage3RedstoneSemanticContract({ bedrockRoot }), {
		devices: 17,
		evidenceFiles: 27,
		status: "implementation_complete_pending_static_validation"
	});
});
