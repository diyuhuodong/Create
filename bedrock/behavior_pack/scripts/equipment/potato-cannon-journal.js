import { decidePotatoRecovery } from "./equipment-upgrade-state.js";
import { createPotatoCannonState, readPotatoCannonState } from "./equipment-state.js";

export const POTATO_CANNON_JOURNAL_SCHEMA_VERSION = 1;
export const POTATO_CANNON_JOURNAL_STAGES = Object.freeze(["intent", "ammo_escrowed", "projectile_spawned"]);

function nonEmpty(value, label) {
	if (typeof value !== "string" || value.length === 0)
		throw new TypeError(`${label} must be a non-empty string`);
	return value;
}

function advance(state, expectedStage, stage) {
	const current = readPotatoCannonState(state);
	if (current.journal?.stage !== expectedStage)
		return { advanced: false, reason: "stage_conflict", state: current };
	return {
		advanced: true,
		state: createPotatoCannonState({ ...current, journal: { ...current.journal, stage }, revision: current.revision + 1 })
	};
}

export function beginPotatoCannonShot(state, { ammoTypeId, ownerId, recoveryRoll, shotId } = {}) {
	const current = readPotatoCannonState(state);
	if (current.journal)
		return { begun: false, reason: "journal_busy", state: current };
	const level = current.upgrades.potatoRecovery;
	const journal = {
		ammoTypeId: nonEmpty(ammoTypeId, "Potato Cannon ammo"),
		ownerId: nonEmpty(ownerId, "Potato Cannon owner"),
		recover: decidePotatoRecovery(level, recoveryRoll),
		recoveryLevel: level,
		recoveryRoll,
		schemaVersion: POTATO_CANNON_JOURNAL_SCHEMA_VERSION,
		shotId: nonEmpty(shotId, "Potato Cannon shot id"),
		stage: "intent"
	};
	return { begun: true, state: createPotatoCannonState({ ...current, journal, revision: current.revision + 1 }) };
}

export function escrowPotatoCannonAmmo(state) {
	return advance(state, "intent", "ammo_escrowed");
}

export function markPotatoCannonProjectileSpawned(state) {
	return advance(state, "ammo_escrowed", "projectile_spawned");
}

export function settlePotatoCannonShot(state, shotId) {
	const current = readPotatoCannonState(state);
	if (current.journal?.shotId !== shotId)
		return { settled: false, reason: "receipt_mismatch", state: current };
	return { settled: true, state: createPotatoCannonState({ ...current, journal: null, revision: current.revision + 1 }) };
}

export function reconcilePotatoCannonJournal(state, activeShotIds = new Set()) {
	const current = readPotatoCannonState(state);
	const journal = current.journal;
	if (!journal)
		return { action: "none", state: current };
	if (["ammo_escrowed", "projectile_spawned"].includes(journal.stage) && activeShotIds.has(journal.shotId))
		return { action: "clear", state: settlePotatoCannonShot(current, journal.shotId).state };
	if (journal.stage === "intent")
		return { action: "cancel", state: settlePotatoCannonShot(current, journal.shotId).state };
	if (journal.stage === "projectile_spawned")
		return { action: "wait", state: current };
	return {
		action: "refund",
		ammoTypeId: journal.ammoTypeId,
		receiptId: journal.shotId,
		state: settlePotatoCannonShot(current, journal.shotId).state
	};
}
