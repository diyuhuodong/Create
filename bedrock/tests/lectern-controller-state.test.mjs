import assert from "node:assert/strict";
import test from "node:test";

import { beginLecternControllerUse, clearLecternControllerSession, createLecternControllerState, endLecternControllerUse, installLecternController, normalizeLecternControllerState, triggerLecternControllerChannel } from "../behavior_pack/scripts/redstone/lectern-controller-state.js";
import { createLinkedControllerItemState } from "../behavior_pack/scripts/redstone/linked-controller-item-state.js";

test("Lectern Controller persists an installed controller and only its active user may transmit", () => {
	const controller = createLinkedControllerItemState({
		channels: [["minecraft:red_wool", "minecraft:blue_wool"], ...Array.from({ length: 5 }, () => ["minecraft:air", "minecraft:air"])]
	});
	const installed = installLecternController({ controller, state: createLecternControllerState() });
	assert.equal(installed.changed, true);
	const started = beginLecternControllerUse({ playerId: "player-a", state: installed.state, tick: 100 });
	assert.equal(started.changed, true);
	assert.equal(beginLecternControllerUse({ playerId: "player-b", state: started.state, tick: 101 }).reason, "in_use");
	const signal = triggerLecternControllerChannel({ channel: 0, playerId: "player-a", state: started.state, tick: 101 });
	assert.deepEqual(signal.frequency, ["minecraft:red_wool", "minecraft:blue_wool"]);
	assert.equal(triggerLecternControllerChannel({ channel: 0, playerId: "player-b", state: started.state, tick: 101 }).reason, "not_active_user");
	assert.equal(endLecternControllerUse({ playerId: "player-a", state: started.state }).state.activeUserId, "");
});

test("Lectern Controller migrations default empty and restart clears an unfinishable UI session", () => {
	const empty = normalizeLecternControllerState();
	assert.equal(empty.controller, null);
	const started = beginLecternControllerUse({
		playerId: "player-a",
		state: installLecternController({ controller: createLinkedControllerItemState(), state: empty }).state,
		tick: 0
	});
	assert.equal(clearLecternControllerSession(started.state).activeUserId, "");
});
