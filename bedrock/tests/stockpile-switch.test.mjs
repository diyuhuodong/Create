import assert from "node:assert/strict";
import test from "node:test";

import {
	STOCKPILE_SWITCH_OUTPUT_DELAY_TICKS,
	configureStockpileSwitch,
	createStockpileSwitchState,
	measureStockpileFluid,
	measureStockpileInventory,
	observeStockpileSwitch,
	stockpileDisplayLevel,
	tickStockpileSwitch,
	unsupportedStockpileObservation
} from "../behavior_pack/scripts/materials/stockpile-switch.js";

test("Stockpile Switch applies Java hysteresis and its two-tick delayed output", () => {
	let state = createStockpileSwitchState();
	state = observeStockpileSwitch(state, { current: 128, kind: "item", maximum: 256, minimum: 0 });
	assert.equal(state.thresholdState, true);
	assert.equal(state.outputPowered, false);
	assert.equal(state.pendingOutputTicks, STOCKPILE_SWITCH_OUTPUT_DELAY_TICKS);
	state = tickStockpileSwitch(state);
	assert.equal(state.outputPowered, false);
	state = tickStockpileSwitch(state);
	assert.equal(state.outputPowered, true);
	state = observeStockpileSwitch(state, { current: 65, kind: "item", maximum: 256, minimum: 0 });
	assert.equal(state.thresholdState, true);
	state = observeStockpileSwitch(state, { current: 64, kind: "item", maximum: 256, minimum: 0 });
	assert.equal(state.thresholdState, false);
	assert.equal(stockpileDisplayLevel(state), 2);
	state = tickStockpileSwitch(tickStockpileSwitch(state));
	assert.equal(state.outputPowered, false);
});

test("Stockpile Switch persists configuration with conflict detection and immediate inversion", () => {
	const state = createStockpileSwitchState({ outputPowered: true, thresholdState: true });
	const conflict = configureStockpileSwitch({ expectedRevision: 1, patch: { inverted: true }, state });
	assert.equal(conflict.conflict, true);
	const configured = configureStockpileSwitch({ expectedRevision: 0, patch: { inverted: true, onWhenAbove: 192 }, state });
	assert.equal(configured.changed, true);
	assert.equal(configured.state.configurationRevision, 1);
	assert.equal(configured.state.outputPowered, false);
});

test("Stockpile Switch counts filtered inventories and Create fluid tanks without treating an empty slot as full", () => {
	const items = measureStockpileInventory({
		filterItem: "minecraft:iron_ingot",
		slots: [
			{ amount: 16, maxAmount: 64, typeId: "minecraft:iron_ingot" },
			{ amount: 12, maxAmount: 64, typeId: "minecraft:gold_ingot" },
			undefined
		]
	});
	assert.deepEqual(items, { current: 16, kind: "item", maximum: 192, minimum: 0 });
	const fluid = measureStockpileFluid({
		capacity: 8_000,
		contents: { amount: 4_000, typeId: "minecraft:water" },
		filterItem: "minecraft:water"
	});
	assert.deepEqual(fluid, { current: 4_000, kind: "fluid", maximum: 8_000, minimum: 0 });
	const unsupported = observeStockpileSwitch(createStockpileSwitchState(), unsupportedStockpileObservation());
	assert.equal(unsupported.currentLevel, -1);
});
