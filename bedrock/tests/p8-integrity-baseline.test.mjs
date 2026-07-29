import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildP8IntegrityBaseline, validateP8IntegrityBaseline } from "../tools/p8-integrity-baseline.mjs";

const bedrockRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function json(path) {
	return JSON.parse(await readFile(resolve(bedrockRoot, path), "utf8"));
}

test("P8 C0 records one deterministic fingerprint across every integrity ledger", async () => {
	const [first, second, committed] = await Promise.all([
		buildP8IntegrityBaseline({ bedrockRoot }),
		buildP8IntegrityBaseline({ bedrockRoot }),
		json("data/p8-integrity-baseline.json")
	]);
	assert.deepEqual(first, second);
	assert.deepEqual(committed, first);
	assert.deepEqual(validateP8IntegrityBaseline(first), {
		documents: 7,
		fingerprint: first.fingerprint,
		...first.authoritativeCounts
	});
	assert.deepEqual(first.openResponsibilities.map(entry => entry.id), ["C1/acquisition-scope"]);
});

test("P8 C0 derives authoritative totals and rejects a stale aggregate fingerprint", async () => {
	const [baseline, catalog, domains, behaviors] = await Promise.all([
		buildP8IntegrityBaseline({ bedrockRoot }),
		json("data/java-registration-catalog.json"),
		json("data/domain-inventory.json"),
		json("data/java-behavior-inventory.json")
	]);
	assert.deepEqual(baseline.authoritativeCounts, {
		behaviors: behaviors.entries.length,
		domains: domains.domains.reduce((total, domain) => total + domain.entries.length, 0),
		registrations: catalog.entries.length
	});
	const stale = structuredClone(baseline);
	stale.documents[0].counts.entries++;
	assert.throws(() => validateP8IntegrityBaseline(stale), /fingerprint is stale/);
});

