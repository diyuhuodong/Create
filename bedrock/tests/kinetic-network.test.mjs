import assert from "node:assert/strict";
import test from "node:test";

import { KineticNetwork } from "../behavior_pack/scripts/kinetics/kinetic-network.js";

test("KineticNetwork propagates signed speed through ratios", () => {
	const network = new KineticNetwork();
	network.addNode({ id: "crank", sourceSpeed: 16, stressCapacity: 32 });
	network.addNode({ id: "gear", stressImpact: 4 });
	network.addNode({ id: "mill", stressImpact: 8 });
	network.connect("crank", "gear", -2);
	network.connect("gear", "mill", 0.5);

	const [state] = network.resolve();
	assert.equal(state.stalled, false);
	assert.equal(state.stressCapacity, 32);
	assert.equal(state.stressImpact, 12);
	assert.deepEqual(state.nodeStates, [
		{ id: "crank", requestedSpeed: 16, speed: 16 },
		{ id: "gear", requestedSpeed: -32, speed: -32 },
		{ id: "mill", requestedSpeed: -16, speed: -16 }
	]);
});

test("KineticNetwork stalls an overloaded component without losing requested speed", () => {
	const network = new KineticNetwork();
	network.addNode({ id: "water_wheel", sourceSpeed: 8, stressCapacity: 4 });
	network.addNode({ id: "crusher", stressImpact: 5 });
	network.connect("water_wheel", "crusher");

	const [state] = network.resolve();
	assert.equal(state.overloaded, true);
	assert.equal(state.stalled, true);
	assert.deepEqual(state.nodeStates, [
		{ id: "crusher", requestedSpeed: 8, speed: 0 },
		{ id: "water_wheel", requestedSpeed: 8, speed: 0 }
	]);
});

test("KineticNetwork detects contradictory source speeds", () => {
	const network = new KineticNetwork();
	network.addNode({ id: "motor_a", sourceSpeed: 16, stressCapacity: 8 });
	network.addNode({ id: "shaft" });
	network.addNode({ id: "motor_b", sourceSpeed: 8, stressCapacity: 8 });
	network.connect("motor_a", "shaft");
	network.connect("shaft", "motor_b");

	const [state] = network.resolve();
	assert.equal(state.hasConflict, true);
	assert.equal(state.stalled, true);
});
