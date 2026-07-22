import assert from "node:assert/strict";
import test from "node:test";

import { buildDeliveryDependencyGraph, validateDeliveryDependencyGraph } from "../tools/delivery-dependency-graph.mjs";

function copy(value) {
	return JSON.parse(JSON.stringify(value));
}

test("delivery dependency graph covers the staged packages with forward-only edges", () => {
	const coverage = validateDeliveryDependencyGraph(buildDeliveryDependencyGraph());
	assert.deepEqual(coverage, { edges: 46, packages: 33 });
});

test("delivery dependency graph rejects the former P4.1 to P4.6 backward edge", () => {
	const graph = copy(buildDeliveryDependencyGraph());
	graph.packages.find(entry => entry.id === "P4.1").dependencies.push("P4.6");
	assert.throws(() => validateDeliveryDependencyGraph(graph), /P4\.1 has a non-forward dependency on P4\.6/);
});
