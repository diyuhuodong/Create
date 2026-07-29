import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildP71AcquisitionLedger, validateP71AcquisitionLedger } from "../tools/p7-1-acquisition-ledger.mjs";

const bedrockRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("P7.1 acquisition ledger preserves Java-only internal content and closes every survival path", async () => {
	const [generated, migrationLedger] = await Promise.all([
		buildP71AcquisitionLedger({ bedrockRoot }),
		readFile(resolve(bedrockRoot, "data/migration-ledger.json"), "utf8").then(JSON.parse)
	]);
	assert.deepEqual(validateP71AcquisitionLedger(generated), { entries: generated.entries.length, missing: 0 });
	const expected = new Set(migrationLedger.registrationEntries
		.filter(entry => entry.status === "implemented" && ["block", "item"].includes(entry.kind))
		.flatMap(entry => entry.mapping.targets)
		.filter(identifier => identifier.startsWith("createbedrock:")));
	assert.equal(generated.entries.length, expected.size);
	assert.deepEqual(new Set(generated.entries.map(entry => entry.identifier)), expected);
	assert.equal(generated.entries.find(entry => entry.identifier === "createbedrock:copper_backtank_placeable").status, "loot_output");
	assert.equal(generated.entries.find(entry => entry.identifier === "createbedrock:rare_creeper_package").status, "runtime_transform");
	assert.deepEqual(generated.entries.find(entry => entry.identifier === "createbedrock:copycat_base").status, "not_survival_content");
	const committed = JSON.parse(await readFile(resolve(bedrockRoot, "data/p7-1-acquisition-ledger.json"), "utf8"));
	assert.deepEqual(committed, generated);
});
