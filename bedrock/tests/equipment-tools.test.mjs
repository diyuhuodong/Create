import assert from "node:assert/strict";
import test from "node:test";

import { clearGogglesDiagnosticAdaptersForTesting, gogglesDiagnosticAdapterIds, queryGogglesDiagnostics, registerGogglesDiagnosticAdapter } from "../behavior_pack/scripts/equipment/goggles-diagnostics-registry.js";
import { bindToolboxSlot, createToolboxBindings, readToolboxBindings, reconcileToolboxBindings } from "../behavior_pack/scripts/equipment/toolbox-bindings.js";
import { clearWrenchHandlersForTesting, invokeWrenchHandler, registerWrenchHandler } from "../behavior_pack/scripts/equipment/wrench-handler-registry.js";

test("Goggles registry exposes seven read-only domain adapters", () => {
	clearGogglesDiagnosticAdaptersForTesting();
	for (const domain of ["kinetics", "processing", "fluids", "logistics", "redstone", "contraptions", "trains"])
		registerGogglesDiagnosticAdapter({ id: domain, supports: context => context.domain === domain, inspect: () => ({ title: domain, lines: ["ok"], revision: 1 }) });
	assert.equal(gogglesDiagnosticAdapterIds().length, 7);
	assert.equal(queryGogglesDiagnostics({ domain: "fluids" }).adapterId, "fluids");
	assert.equal(queryGogglesDiagnostics({ domain: "unknown" }), undefined);
});

test("Wrench registry fails closed and never falls through to generic deletion", () => {
	clearWrenchHandlersForTesting();
	registerWrenchHandler({ actions: ["rotate"], id: "safe", supports: context => context.typeId === "createbedrock:cogwheel", invoke: () => ({ handled: true }) });
	assert.equal(invokeWrenchHandler({ typeId: "minecraft:chest" }, "remove").reason, "unsupported");
	assert.equal(invokeWrenchHandler({ typeId: "createbedrock:cogwheel" }, "rotate").handled, true);
});

test("Toolbox bindings migrate v1, cover nine hotbar slots, and reject stale CAS", () => {
	const migrated = readToolboxBindings({ compartment: 2, hotbarSlot: 1, revision: 3, schemaVersion: 1, toolboxId: "box:1" });
	assert.equal(migrated.schemaVersion, 2);
	let state = createToolboxBindings();
	for (let hotbarSlot = 0; hotbarSlot < 9; hotbarSlot++) {
		const result = bindToolboxSlot(state, { compartment: hotbarSlot % 8, hotbarSlot, revision: hotbarSlot, toolboxId: "box:1" }, state.revision);
		assert.equal(result.bound, true);
		state = result.state;
	}
	assert.equal(state.bindings.length, 9);
	assert.equal(bindToolboxSlot(state, { compartment: 0, hotbarSlot: 0, revision: 0, toolboxId: "box:2" }, 0).reason, "revision_conflict");
	assert.equal(reconcileToolboxBindings(state, binding => binding.hotbarSlot !== 4).bindings.length, 8);
});
