import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { assertP82Convergence } from "../tools/p8-2-registration-convergence.mjs";
import { assertP83Convergence, buildP83SemanticRegistrationConvergence, P83_SEMANTIC_REGISTRATION_MAPPINGS } from "../tools/p8-3-semantic-registration-convergence.mjs";

const json = name => readFile(resolve("data", name), "utf8").then(JSON.parse);

test("P8.3 supplies explicit semantic mappings for every P8.2 registration deferral", async () => {
	const [p82, p83, ledger, overrides] = await Promise.all([
		json("p8-2-registration-convergence.json"), json("p8-3-semantic-registration-convergence.json"),
		json("migration-ledger.json"), json("migration-overrides.json")
	]);
	assert.deepEqual(assertP82Convergence(p82), { deferred: 50, resolved: 329, total: 379 });
	assert.deepEqual(assertP83Convergence(p83), { resolved: 50, total: 50 });
	assert.equal(P83_SEMANTIC_REGISTRATION_MAPPINGS.length, 50);
	const expected = await buildP83SemanticRegistrationConvergence({ bedrockRoot: resolve("."), p82Convergence: p82, overrides });
	assert.deepEqual(p83, expected.document);
	assert.deepEqual(overrides, expected.overrides);
	assert.deepEqual(new Set(p83.entries.map(entry => entry.sourceKey)), new Set(p82.deferred.map(entry => entry.sourceKey)));
	const registrations = new Map(ledger.registrationEntries.map(entry => [entry.sourceKey, entry]));
	for (const entry of p83.entries) {
		const registration = registrations.get(entry.sourceKey);
		assert.equal(registration?.status, "implemented");
		assert.equal(registration?.acquisition, "verified");
		assert.equal(registration?.resources, "verified");
		assert.equal(overrides.entries.find(override => override.sourceKey === entry.sourceKey)?.p8Semantic?.package, "P8.3");
	}
});
