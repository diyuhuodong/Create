import assert from "node:assert/strict";
import test from "node:test";

import { createDiagnosticsSummary, serializeDiagnosticsSummary } from "../behavior_pack/scripts/kernel/diagnostics-summary.js";

test("diagnostic summary retains operational counters and removes inventory payloads", () => {
	const diagnostics = {
		failures: { fluids: "Error: write failed for {\"slot\":2,\"typeId\":\"minecraft:diamond\"}" },
		providers: {
			fluids: { activeTransfers: 2, journal: { rollbackAttempts: 3, rollbacks: 1 }, totalFluid: 500 },
			logistics: {
				inventory: { slots: [{ count: 64, typeId: "minecraft:diamond" }] },
				journal: { activeRecords: 1, rollbacks: 2 }
			}
		},
		scheduler: {
			fluids: { budget: 8, failed: 1, pending: 3 },
			logistics: { budget: 8, failed: 0, pending: 1 }
		}
	};

	const summary = createDiagnosticsSummary(diagnostics);
	assert.deepEqual(summary.kernel, { budget: 16, failed: 1, groups: 2, pending: 4 });
	assert.deepEqual(summary.providers.fluids.journal, { rollbackAttempts: 3, rollbacks: 1 });
	assert.equal(summary.providers.logistics.inventory, undefined);
	assert.equal(JSON.stringify(summary).includes("minecraft:diamond"), false);
	assert.match(summary.failures.fluids, /<redacted>/);
	assert.doesNotThrow(() => JSON.parse(serializeDiagnosticsSummary(diagnostics)));
});

test("diagnostic serializer keeps its fallback valid JSON", () => {
	const message = serializeDiagnosticsSummary({
		failures: {},
		providers: { example: { detail: "x".repeat(500) } },
		scheduler: { example: { budget: 2, failed: 0, pending: 1 } }
	}, 64);

	assert.deepEqual(JSON.parse(message), {
		failures: [],
		kernel: { budget: 2, failed: 0, groups: 1, pending: 1 },
		providerCount: 1,
		truncated: true
	});
});
