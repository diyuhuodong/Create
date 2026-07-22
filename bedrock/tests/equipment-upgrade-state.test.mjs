import assert from "node:assert/strict";
import test from "node:test";

import { applyEquipmentUpgrade, decidePotatoRecovery, potatoRecoveryChance } from "../behavior_pack/scripts/equipment/equipment-upgrade-state.js";
import { backtankCapacity, createBacktankState, createPotatoCannonState, readBacktankState, readPotatoCannonState } from "../behavior_pack/scripts/equipment/equipment-state.js";

test("equipment schema 1 is read and written as schema 2", () => {
	const backtank = readBacktankState({ air: 1200, capacityLevel: 1, itemType: "createbedrock:copper_backtank", revision: 4, schemaVersion: 1 });
	assert.equal(backtank.schemaVersion, 2);
	assert.equal(backtank.upgrades.capacity, 1);
	assert.equal(readPotatoCannonState({ cooldownUntil: 20, revision: 1, schemaVersion: 1 }).schemaVersion, 2);
	assert.throws(() => readBacktankState({ schemaVersion: 99 }), /Unsupported/);
});

test("Capacity upgrades are target checked, CAS guarded, and bounded", () => {
	let state = createBacktankState({ air: 900 });
	for (let level = 1; level <= 3; level++) {
		const result = applyEquipmentUpgrade(state, { expectedRevision: state.revision, kind: "capacity", receiptId: `capacity:${level}`, targetTypeId: state.itemType });
		assert.equal(result.applied, true);
		state = createBacktankState(result.state);
		assert.equal(state.capacityLevel, level);
		assert.equal(backtankCapacity(level), 900 + level * 300);
	}
	assert.equal(applyEquipmentUpgrade(state, { expectedRevision: state.revision, kind: "capacity", receiptId: "capacity:4", targetTypeId: state.itemType }).reason, "maximum_level");
	assert.equal(applyEquipmentUpgrade(state, { expectedRevision: 0, kind: "capacity", receiptId: "stale", targetTypeId: state.itemType }).reason, "revision_conflict");
});

test("Potato Recovery makes one deterministic pre-launch decision", () => {
	let state = createPotatoCannonState();
	const upgraded = applyEquipmentUpgrade(state, { expectedRevision: 0, kind: "potatoRecovery", receiptId: "recovery:1", targetTypeId: "createbedrock:potato_cannon" });
	state = createPotatoCannonState(upgraded.state);
	assert.equal(potatoRecoveryChance(1), .25);
	assert.equal(decidePotatoRecovery(state.upgrades.potatoRecovery, .249), true);
	assert.equal(decidePotatoRecovery(state.upgrades.potatoRecovery, .25), false);
});
