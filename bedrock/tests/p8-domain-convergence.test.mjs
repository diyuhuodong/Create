import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { assertP84Convergence, buildP84DomainConvergence } from "../tools/p8-4-domain-convergence.mjs";

const json = name => readFile(resolve("data", name), "utf8").then(JSON.parse);

test("P8.4 classifies every source-domain entry without hiding Java-only formats as Bedrock equivalence", async () => {
	const [domainInventory, recipeIr, resourceLedger, tagProjections, convergence] = await Promise.all([
		json("domain-inventory.json"), json("recipes/recipe-ir.json"), json("p7-6-resource-ledger.json"), json("recipes/tag-projections.json"), json("p8-4-domain-convergence.json")
	]);
	const expected = await buildP84DomainConvergence({ bedrockRoot: resolve("."), domainInventory, recipeIr, resourceLedger, tagProjections });
	assert.deepEqual(convergence, expected);
	const coverage = assertP84Convergence(convergence);
	assert.equal(coverage.entries, 9067);
	assert.equal(coverage.partial, 0);
	assert.equal(convergence.entries.filter(entry => entry.domain === "advancements").every(entry => entry.status === "not_applicable"), true);
	assert.equal(convergence.entries.filter(entry => entry.domain === "compatibility_classes").every(entry => entry.status === "deferred_compat"), true);
});
