import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateP8EvidenceRecordCompletion } from "../tools/p8-parity-evidence-ledger.mjs";

test("P8 C5 gives every core registration and domain a concrete runtime, contract test, and pending platform scenario", async () => {
	const ledger = JSON.parse(await readFile(new URL("../data/p8-parity-evidence-ledger.json", import.meta.url), "utf8"));
	const core = ledger.records.filter(record => ["registration", "domain"].includes(record.recordType) && ["implemented", "equivalent", "implemented_with_documented_difference", "platform_capability_blocked"].includes(record.status));
	assert.ok(core.length > 0);
	for (const record of core) {
		assert.equal(record.evidenceState, "linked");
		assert.ok(record.evidence.staticTests.includes(`tests/p8-c5-parity-evidence.test.mjs#${record.recordType}:${encodeURIComponent(record.sourceKey)}`));
		assert.ok(record.evidence.platformScenarios.includes(`P8.6/${record.recordType}/${encodeURIComponent(record.sourceKey)}`));
		assert.equal(validateP8EvidenceRecordCompletion(record), true);
	}
});
