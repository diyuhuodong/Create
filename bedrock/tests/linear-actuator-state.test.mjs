import assert from "node:assert/strict";
import test from "node:test";

import { ASSEMBLY_SUBBLOCK_UNITS } from "../behavior_pack/scripts/contraptions/assembly-transform.js";
import {
	activateLinearActuator,
	advanceLinearActuator,
	createLinearActuatorState,
	freezeLinearActuator,
	linearTravelForSpeed,
	normalizeLinearActuatorState,
	releaseLinearActuator,
	serializeLinearActuatorState,
	transformForLinearActuator
} from "../behavior_pack/scripts/contraptions/linear-actuator-state.js";

test("linear actuators advance in fixed-point units, clamp at their range, and preserve exact transforms", () => {
	let state = createLinearActuatorState({ direction: { x: 1, y: 0, z: 0 }, kind: "mechanical_piston", maxDistance: 1 });
	state = activateLinearActuator(state, { assemblyId: "linear:piston" });
	const first = advanceLinearActuator(state, 16);
	assert.equal(first.changed, true);
	assert.equal(first.state.distance, 1024);
	assert.deepEqual(first.transform.translation, { x: 1024, y: 0, z: 0 });
	const end = [1, 2, 3].reduce(result => advanceLinearActuator(result.state, 256), first);
	assert.equal(end.state.distance, ASSEMBLY_SUBBLOCK_UNITS);
	assert.equal(end.transform.translation.x, ASSEMBLY_SUBBLOCK_UNITS);
	assert.equal(advanceLinearActuator(end.state, 1).atLimit, true);
	assert.equal(linearTravelForSpeed(-16), -1024);
});

test("linear actuators freeze without changing authority and only release at block-aligned positions", () => {
	let state = activateLinearActuator(createLinearActuatorState({ direction: { x: 0, y: -1, z: 0 }, kind: "rope_pulley", maxDistance: 4 }), {
		assemblyId: "linear:rope"
	});
	state = advanceLinearActuator(state, 16).state;
	assert.equal(releaseLinearActuator(state).released, false);
	const frozen = freezeLinearActuator(state, "world_blocked:0:63:0");
	assert.equal(advanceLinearActuator(frozen, 16).reason, "frozen");
	assert.equal(transformForLinearActuator(frozen).translation.y, -1024);
	const restored = normalizeLinearActuatorState(serializeLinearActuatorState(frozen));
	assert.deepEqual(restored, frozen);
});
