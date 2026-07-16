import assert from "node:assert/strict";
import test from "node:test";

import {
	PLACARD_PULSE_TICKS,
	createPlacardState,
	insertPlacardItem,
	placardHasItem,
	placardPowered,
	removePlacardItem,
	tickPlacard,
	triggerPlacard
} from "../behavior_pack/scripts/materials/placard.js";

test("Placard stores one item, emits a refreshed 20-tick matching-item pulse, and releases the item", () => {
	let state = createPlacardState();
	const inserted = insertPlacardItem(state, "minecraft:iron_ingot");
	assert.equal(inserted.changed, true);
	state = inserted.state;
	assert.equal(placardHasItem(state), true);
	assert.equal(insertPlacardItem(state, "minecraft:gold_ingot").changed, false);
	assert.equal(triggerPlacard(state, "minecraft:gold_ingot").changed, false);
	state = triggerPlacard(state, "minecraft:iron_ingot").state;
	assert.equal(state.pulseTicks, PLACARD_PULSE_TICKS);
	assert.equal(placardPowered(state), true);
	state = tickPlacard(state);
	assert.equal(state.pulseTicks, PLACARD_PULSE_TICKS - 1);
	state = triggerPlacard(state, "minecraft:iron_ingot").state;
	assert.equal(state.pulseTicks, PLACARD_PULSE_TICKS);
	for (let tick = 0; tick < PLACARD_PULSE_TICKS; tick++)
		state = tickPlacard(state);
	assert.equal(placardPowered(state), false);
	const removed = removePlacardItem(state);
	assert.equal(removed.itemTypeId, "minecraft:iron_ingot");
	assert.equal(placardHasItem(removed.state), false);
});

test("Placard state rejects invalid persisted item identifiers and pulse durations", () => {
	assert.throws(() => createPlacardState({ heldItem: "iron_ingot" }), /namespaced Bedrock item identifiers/);
	assert.throws(() => createPlacardState({ pulseTicks: PLACARD_PULSE_TICKS + 1 }), /pulse ticks/);
});
