export const PLACARD_BLOCK = "createbedrock:placard";
export const PLACARD_SCHEMA = 1;
export const PLACARD_PULSE_TICKS = 20;

const ITEM_IDENTIFIER = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

export function normalizePlacardItem(value) {
	if (typeof value !== "string" || !ITEM_IDENTIFIER.test(value) || value.length > 128)
		throw new TypeError("Placard items must be namespaced Bedrock item identifiers");
	return value;
}

export function createPlacardState(patch = {}) {
	return validatePlacardState({
		schemaVersion: PLACARD_SCHEMA,
		revision: 0,
		heldItem: "minecraft:air",
		pulseTicks: 0,
		...clone(patch)
	});
}

export function validatePlacardState(state) {
	if (!state || typeof state !== "object" || Array.isArray(state))
		throw new TypeError("Placard state must be an object");
	if (state.schemaVersion !== PLACARD_SCHEMA)
		throw new Error(`Placard state must use schema ${PLACARD_SCHEMA}`);
	if (!Number.isSafeInteger(state.revision) || state.revision < 0)
		throw new RangeError("Placard revisions must be non-negative safe integers");
	normalizePlacardItem(state.heldItem);
	if (!Number.isInteger(state.pulseTicks) || state.pulseTicks < 0 || state.pulseTicks > PLACARD_PULSE_TICKS)
		throw new RangeError(`Placard pulse ticks must be between 0 and ${PLACARD_PULSE_TICKS}`);
	return clone(state);
}

export function placardHasItem(state) {
	return validatePlacardState(state).heldItem !== "minecraft:air";
}

/** Java stores one ItemStack. The Bedrock v1 bridge deliberately persists a plain, stackable item type. */
export function insertPlacardItem(state, itemTypeId) {
	const current = validatePlacardState(state);
	const heldItem = normalizePlacardItem(itemTypeId);
	if (heldItem === "minecraft:air")
		throw new Error("Placards cannot hold air");
	if (current.heldItem !== "minecraft:air")
		return { changed: false, state: current };
	return {
		changed: true,
		state: validatePlacardState({ ...current, heldItem, revision: current.revision + 1 })
	};
}

export function removePlacardItem(state) {
	const current = validatePlacardState(state);
	if (current.heldItem === "minecraft:air")
		return { changed: false, itemTypeId: undefined, state: current };
	return {
		changed: true,
		itemTypeId: current.heldItem,
		state: validatePlacardState({ ...current, heldItem: "minecraft:air", pulseTicks: 0, revision: current.revision + 1 })
	};
}

/** Matching an inserted item mirrors PlacardBlock: set a full-strength pulse and refresh its duration. */
export function triggerPlacard(state, itemTypeId) {
	const current = validatePlacardState(state);
	if (current.heldItem === "minecraft:air" || current.heldItem !== normalizePlacardItem(itemTypeId))
		return { changed: false, state: current };
	const next = { ...current, pulseTicks: PLACARD_PULSE_TICKS };
	return { changed: JSON.stringify(next) !== JSON.stringify(current), state: validatePlacardState(next) };
}

export function tickPlacard(state) {
	const current = validatePlacardState(state);
	if (current.pulseTicks === 0)
		return current;
	return validatePlacardState({ ...current, pulseTicks: current.pulseTicks - 1 });
}

export function placardPowered(state) {
	return validatePlacardState(state).pulseTicks > 0;
}
