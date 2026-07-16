import assert from "node:assert/strict";
import test from "node:test";

import {
	TRAPDOOR_OPEN_STATE,
	TRAPDOOR_POWERED_STATE,
	toggledTrapdoorPermutation,
	trapdoorOpenState,
	trapdoorStatesForPower,
	withTrapdoorStates
} from "../behavior_pack/scripts/materials/framed-glass-trapdoor.js";

function permutation(states) {
	return {
		getAllStates() {
			return states;
		},
		withState(name, value) {
			return permutation({ ...states, [name]: value });
		}
	};
}

test("framed glass trapdoor follows native redstone power", () => {
	assert.deepEqual(trapdoorStatesForPower(0), { open: 0, powered: 0 });
	assert.deepEqual(trapdoorStatesForPower(1), { open: 1, powered: 1 });
	assert.deepEqual(trapdoorStatesForPower(15), { open: 1, powered: 1 });
	assert.throws(() => trapdoorStatesForPower(-1), /0 through 15/);
});

test("framed glass trapdoor manual use changes open state without erasing power", () => {
	const closedPowered = permutation({ [TRAPDOOR_OPEN_STATE]: 0, [TRAPDOOR_POWERED_STATE]: 1 });
	const opened = toggledTrapdoorPermutation(closedPowered);
	assert.equal(trapdoorOpenState(opened), 1);
	assert.equal(opened.getAllStates()[TRAPDOOR_POWERED_STATE], 1);
	const redstoneClosed = withTrapdoorStates(opened, trapdoorStatesForPower(0));
	assert.deepEqual(redstoneClosed.getAllStates(), { [TRAPDOOR_OPEN_STATE]: 0, [TRAPDOOR_POWERED_STATE]: 0 });
});
