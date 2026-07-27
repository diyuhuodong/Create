import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildP71AcquisitionLedger, validateP71AcquisitionLedger } from "../tools/p7-1-acquisition-ledger.mjs";

const bedrockRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("P7.1 acquisition ledger classifies every partial content projection and exposes only actionable gaps", async () => {
	const generated = await buildP71AcquisitionLedger({ bedrockRoot });
	assert.deepEqual(validateP71AcquisitionLedger(generated), { entries: 253, missing: 3 });
	assert.deepEqual(generated.entries.filter(entry => entry.status === "missing").map(entry => entry.identifier), [
		"createbedrock:copycat_bars",
		"createbedrock:copycat_base",
		"createbedrock:elevator_contact"
	]);
	const committed = JSON.parse(await readFile(resolve(bedrockRoot, "data/p7-1-acquisition-ledger.json"), "utf8"));
	assert.deepEqual(committed, generated);
});
