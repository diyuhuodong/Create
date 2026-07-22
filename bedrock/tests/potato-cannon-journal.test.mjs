import assert from "node:assert/strict";
import test from "node:test";

import { beginPotatoCannonShot, escrowPotatoCannonAmmo, markPotatoCannonProjectileSpawned, reconcilePotatoCannonJournal, settlePotatoCannonShot } from "../behavior_pack/scripts/equipment/potato-cannon-journal.js";
import { applyEquipmentUpgrade } from "../behavior_pack/scripts/equipment/equipment-upgrade-state.js";
import { createPotatoCannonState } from "../behavior_pack/scripts/equipment/equipment-state.js";

function upgradedCannon() {
	const initial = createPotatoCannonState();
	return createPotatoCannonState(applyEquipmentUpgrade(initial, { expectedRevision: 0, kind: "potatoRecovery", receiptId: "upgrade:1", targetTypeId: "createbedrock:potato_cannon" }).state);
}

test("Cannon journal fixes its Recovery decision before ammo escrow", () => {
	const begun = beginPotatoCannonShot(upgradedCannon(), { ammoTypeId: "minecraft:potato", ownerId: "player:1", recoveryRoll: .2, shotId: "shot:1" });
	assert.equal(begun.begun, true);
	assert.equal(begun.state.journal.recover, true);
	assert.equal(beginPotatoCannonShot(begun.state, { ammoTypeId: "minecraft:potato", ownerId: "player:1", recoveryRoll: .9, shotId: "shot:2" }).reason, "journal_busy");
});

test("Cannon journal is ordered and settles a receipt once", () => {
	const begun = beginPotatoCannonShot(upgradedCannon(), { ammoTypeId: "minecraft:potato", ownerId: "player:1", recoveryRoll: .9, shotId: "shot:2" }).state;
	const escrowed = escrowPotatoCannonAmmo(begun).state;
	assert.equal(markPotatoCannonProjectileSpawned(begun).reason, "stage_conflict");
	const spawned = markPotatoCannonProjectileSpawned(escrowed).state;
	const settled = settlePotatoCannonShot(spawned, "shot:2");
	assert.equal(settled.settled, true);
	assert.equal(settlePotatoCannonShot(settled.state, "shot:2").settled, false);
});

test("restart reconciliation cancels intent and refunds escrow without duplication", () => {
	const begun = beginPotatoCannonShot(createPotatoCannonState(), { ammoTypeId: "minecraft:potato", ownerId: "player:1", recoveryRoll: .8, shotId: "shot:3" }).state;
	assert.equal(reconcilePotatoCannonJournal(begun).action, "cancel");
	const refund = reconcilePotatoCannonJournal(escrowPotatoCannonAmmo(begun).state);
	assert.equal(refund.action, "refund");
	assert.equal(refund.ammoTypeId, "minecraft:potato");
});

test("restart reconciliation never refunds ammo owned by a live or uncertain projectile", () => {
	const begun = beginPotatoCannonShot(createPotatoCannonState(), { ammoTypeId: "minecraft:potato", ownerId: "player:1", recoveryRoll: .8, shotId: "shot:4" }).state;
	const escrowed = escrowPotatoCannonAmmo(begun).state;
	assert.equal(reconcilePotatoCannonJournal(escrowed, new Set(["shot:4"])).action, "clear");
	const spawned = markPotatoCannonProjectileSpawned(escrowed).state;
	assert.equal(reconcilePotatoCannonJournal(spawned).action, "wait");
});
