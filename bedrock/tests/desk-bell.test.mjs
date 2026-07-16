import assert from "node:assert/strict";
import test from "node:test";

import { DESK_BELL_PRESS_TICKS, deskBellReleaseDelay, deskBellSoundOptions, withDeskBellPower } from "../behavior_pack/scripts/materials/desk-bell.js";

test("Desk Bell holds its Java-equivalent 20-tick pulse", () => {
	assert.equal(DESK_BELL_PRESS_TICKS, 20);
	assert.equal(deskBellReleaseDelay(), 20);
});

test("Desk Bell changes only its powered state", () => {
	const permutation = {
		withState(name, value) {
			return { name, value };
		}
	};
	assert.deepEqual(withDeskBellPower(permutation, 1), { name: "createbedrock:powered", value: 1 });
	assert.throws(() => withDeskBellPower(permutation, 2), /0 or 1/);
	assert.deepEqual(deskBellSoundOptions(), { pitch: 1, volume: 1 });
});
