import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildP71AcquisitionLedger, validateP71AcquisitionLedger } from "../tools/p7-1-acquisition-ledger.mjs";

const bedrockRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("P7.1 acquisition ledger preserves Java-only internal content and closes every survival path", async () => {
	const generated = await buildP71AcquisitionLedger({ bedrockRoot });
	assert.deepEqual(validateP71AcquisitionLedger(generated), { entries: generated.entries.length, missing: 0 });
	const committed = JSON.parse(await readFile(resolve(bedrockRoot, "data/p7-1-acquisition-ledger.json"), "utf8"));
	assert.deepEqual(committed, generated);
});
