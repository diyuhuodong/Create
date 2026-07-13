import assert from "node:assert/strict";
import test from "node:test";

import { DiagnosticsRegistry } from "../behavior_pack/scripts/kernel/diagnostics-registry.js";

test("DiagnosticsRegistry collects providers while isolating failures", () => {
	const registry = new DiagnosticsRegistry();
	registry.register("kinetics", () => ({ nodes: 3 }));
	registry.register("trains", () => { throw new Error("unavailable"); });

	assert.deepEqual(registry.collect(), {
		failures: { trains: "Error: unavailable" },
		providers: { kinetics: { nodes: 3 } }
	});
});

test("DiagnosticsRegistry rejects invalid and duplicate providers", () => {
	const registry = new DiagnosticsRegistry();
	assert.throws(() => registry.register("", () => {}), /name/);
	assert.throws(() => registry.register("test", undefined), /functions/);
	registry.register("test", () => ({}));
	assert.throws(() => registry.register("test", () => ({})), /already exists/);
});
