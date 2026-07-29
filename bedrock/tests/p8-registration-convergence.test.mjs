import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { assertP82Convergence, buildP82RegistrationConvergence } from "../tools/p8-2-registration-convergence.mjs";

const json = name => readFile(resolve("data", name), "utf8").then(JSON.parse);

test("P8.2 upgrades only registrations corroborated by matrix, target artifacts, and runtime paths", async () => {
	const [catalog, convergence, ledger, matrix, overrides] = await Promise.all([
		json("java-registration-catalog.json"), json("p8-2-registration-convergence.json"), json("migration-ledger.json"),
		json("migration-matrix.json"), json("migration-overrides.json")
	]);
	assert.deepEqual(assertP82Convergence(convergence), { deferred: 50, resolved: 329, total: 379 });
	const expected = await buildP82RegistrationConvergence({ bedrockRoot: resolve("."), catalog, matrix, overrides });
	assert.deepEqual(convergence, expected.document);
	assert.deepEqual(overrides, expected.overrides);
	const registrations = new Map(ledger.registrationEntries.map(entry => [entry.sourceKey, entry]));
	for (const entry of convergence.resolved) {
		const registration = registrations.get(entry.sourceKey);
		assert.equal(registration?.status, "implemented");
		assert.equal(registration?.resources, "verified");
		assert.equal(registration?.behavior, entry.behavior);
	}
	for (const entry of convergence.deferred) {
		const registration = registrations.get(entry.sourceKey);
		const semanticOverride = overrides.entries.find(override => override.sourceKey === entry.sourceKey)?.p8Semantic;
		assert.equal(registration?.status, semanticOverride?.package === "P8.3" ? "implemented" : "partial");
	}
	assert.equal(convergence.deferred.filter(entry => entry.reason.includes("no concrete mapped Bedrock target artifact")).length, 20);
	assert.equal(convergence.deferred.filter(entry => entry.reason.includes("No legacy static-verification record exists")).length, 30);
});
