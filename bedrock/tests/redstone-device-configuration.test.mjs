import assert from "node:assert/strict";
import test from "node:test";

import { configureRedstoneDevice, createRedstoneDeviceConfiguration, deviceConfigurationFields, normalizeRedstoneDeviceConfiguration } from "../behavior_pack/scripts/redstone/redstone-device-configuration.js";
import { createRedstoneDeviceState } from "../behavior_pack/scripts/redstone/redstone-device-state.js";

test("configuration envelopes migrate absent R0 records and expose only device-supported fields", () => {
	assert.deepEqual(normalizeRedstoneDeviceConfiguration(), createRedstoneDeviceConfiguration());
	assert.deepEqual(deviceConfigurationFields("redstone_link").map(field => field.key), ["mode", "frequencyLeft", "frequencyRight"]);
	assert.deepEqual(deviceConfigurationFields("display_link").map(field => field.key), ["sourceKind", "sourceOffsetX", "sourceOffsetY", "sourceOffsetZ", "targetOffsetX", "targetOffsetY", "targetOffsetZ", "targetLine"]);
	assert.deepEqual(deviceConfigurationFields("nixie_tube").map(field => field.key), ["customText", "styleColor", "styleBrightness"]);
	assert.deepEqual(deviceConfigurationFields("analog_lever"), []);
});

test("configuration edits use public optimistic concurrency instead of player ownership", () => {
	const configuration = createRedstoneDeviceConfiguration();
	const state = createRedstoneDeviceState("rotation_speed_controller");
	const first = configureRedstoneDevice({
		configuration,
		editorId: "player-a",
		expectedRevision: 0,
		patch: { targetSpeed: -96 },
		state
	});
	assert.equal(first.changed, true);
	assert.equal(first.configuration.revision, 1);
	assert.equal(first.configuration.lastEditorId, "player-a");
	assert.equal(first.state.targetSpeed, -96);

	const stale = configureRedstoneDevice({
		configuration: first.configuration,
		editorId: "player-b",
		expectedRevision: 0,
		patch: { targetSpeed: 32 },
		state: first.state
	});
	assert.equal(stale.conflict, true);
	assert.equal(stale.changed, false);
	assert.equal(stale.state.targetSpeed, -96);
});

test("configuration validates its per-device surface and normalizes both redstone-link frequency slots", () => {
	const configured = configureRedstoneDevice({
		configuration: createRedstoneDeviceConfiguration(),
		editorId: "player-a",
		expectedRevision: 0,
		patch: {
			frequencyLeft: "minecraft:red_wool",
			frequencyRight: "minecraft:blue_wool",
			mode: "receiver"
		},
		state: createRedstoneDeviceState("redstone_link")
	});
	assert.equal(configured.state.mode, "receiver");
	assert.deepEqual(configured.state.frequency, ["minecraft:red_wool", "minecraft:blue_wool"]);
	assert.throws(() => configureRedstoneDevice({
		configuration: createRedstoneDeviceConfiguration(),
		editorId: "player-a",
		expectedRevision: 0,
		patch: { requestAmount: 2 },
		state: createRedstoneDeviceState("redstone_link")
	}), /does not support/);
});

test("Requester and Stock Link persist normalized addressed-logistics settings", () => {
	const requester = configureRedstoneDevice({
		configuration: createRedstoneDeviceConfiguration(),
		editorId: "player-a",
		expectedRevision: 0,
		patch: { networkId: "Factory.Main", targetAddress: " Smelter   A " },
		state: createRedstoneDeviceState("redstone_requester")
	});
	assert.deepEqual(requester.configuration.settings, { networkId: "factory.main", targetAddress: "Smelter A" });
	assert.throws(() => configureRedstoneDevice({
		configuration: createRedstoneDeviceConfiguration(),
		editorId: "player-a",
		expectedRevision: 0,
		patch: { networkId: "not allowed" },
		state: createRedstoneDeviceState("stock_link")
	}), /Logistics network IDs/);
});

test("Content Observer configuration persists its concrete item filter in device state", () => {
	const observer = configureRedstoneDevice({
		configuration: createRedstoneDeviceConfiguration(),
		editorId: "player-a",
		expectedRevision: 0,
		patch: { filterItem: "minecraft:iron_ingot" },
		state: createRedstoneDeviceState("content_observer")
	});
	assert.equal(observer.state.filterItem, "minecraft:iron_ingot");
	assert.deepEqual(observer.configuration.settings, {});
});

test("display and Nixie UI settings persist outside simulation state and configure R5 targets", () => {
	const display = configureRedstoneDevice({
		configuration: normalizeRedstoneDeviceConfiguration({ lastEditorId: "", revision: 0, schemaVersion: 1 }),
		editorId: "player-a",
		expectedRevision: 0,
		patch: { sourceKind: "redstone_signal", targetLine: 3, targetOffsetX: 4 },
		state: createRedstoneDeviceState("display_link")
	});
	assert.equal(display.configuration.settings.targetLine, 3);
	assert.equal(display.configuration.settings.targetOffsetX, 4);
	assert.equal(display.state.displayValue, "0");
	const nixie = configureRedstoneDevice({
		configuration: createRedstoneDeviceConfiguration(),
		editorId: "player-a",
		expectedRevision: 0,
		patch: { customText: "Create", styleBrightness: 8, styleColor: "green" },
		state: createRedstoneDeviceState("nixie_tube")
	});
	assert.equal(nixie.configuration.settings.customText, "Create");
	assert.equal(nixie.configuration.settings.styleColor, "green");
	assert.equal(nixie.configuration.settings.styleBrightness, 8);
});
