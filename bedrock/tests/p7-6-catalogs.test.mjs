import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildP76GuidanceLedger, buildP76ResourceLedger, buildP76WorkQueue, P76_PACKAGE_IDS } from "../tools/p7-6-catalogs.mjs";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const domainInventory = JSON.parse(await readFile(new URL("../data/domain-inventory.json", import.meta.url), "utf8"));

test("P7.6 work queue preserves eight ordered forward-only packages", () => {
	const queue = buildP76WorkQueue();
	assert.deepEqual(queue.packages.map(entry => entry.id), P76_PACKAGE_IDS);
	assert.deepEqual(queue.packages.slice(1).map(entry => entry.dependencies[0]), P76_PACKAGE_IDS.slice(0, -1));
	assert.ok(queue.packages.every(entry => entry.status === "static_verified"));
});

test("P7.6 resource ledger classifies every Java source and generated asset", () => {
	const ledger = buildP76ResourceLedger(domainInventory);
	assert.equal(ledger.summary.total, domainInventory.summary.source_assets + domainInventory.summary.generated_assets);
	assert.equal(ledger.entries.some(entry => ["unclassified", "missing", "partial"].includes(entry.relation)), false);
	assert.ok(ledger.entries.every(entry => entry.target || entry.reason));
});

test("P7.6 guidance ledger covers all 52 Ponder scene families", async () => {
	const ledger = await buildP76GuidanceLedger({ domainInventory, repositoryRoot });
	assert.equal(ledger.summary.sceneFamilies, 52);
	assert.ok(ledger.summary.storyboards > 100);
	assert.ok(ledger.entries.every(entry => entry.tutorialId.startsWith("createbedrock:guide/")));
});
