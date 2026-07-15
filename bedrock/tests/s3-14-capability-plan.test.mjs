import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateS314CapabilityPlan } from "../tools/s3-14-capability-plan-schema.mjs";

const bedrockRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

test("S3-14 semantic completion plan covers all devices with ordered packages and source evidence", async () => {
	const result = await validateS314CapabilityPlan({
		dataPath: resolve(bedrockRoot, "data", "s3-14-capability-plan.json"),
		repositoryRoot: resolve(bedrockRoot, "..")
	});
	assert.deepEqual(result, { acceptanceIds: 29, devices: 13, packages: 7 });
});
