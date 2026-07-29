import assert from "node:assert/strict";
import test from "node:test";

import { REDSTONE_DEVICE_CATALOG, allRedstoneAcceptanceIds, redstoneDeviceForBlock } from "../behavior_pack/scripts/redstone/redstone-device-catalog.js";
import { createRedstoneDeviceState, nativeOutputPower, transitionRedstoneDevice } from "../behavior_pack/scripts/redstone/redstone-device-state.js";

function ticks(state, count) {
	let next = state;
	for (let index = 0; index < count; index++)
		next = transitionRedstoneDevice(next, { type: "tick" });
	return next;
}

test("redstone device catalog owns all 29 S3-14 acceptance IDs exactly once", () => {
	assert.equal(REDSTONE_DEVICE_CATALOG.length, 17);
	const acceptanceIds = allRedstoneAcceptanceIds();
	assert.equal(acceptanceIds.length, 29);
	assert.equal(new Set(acceptanceIds).size, acceptanceIds.length);
	assert.equal(REDSTONE_DEVICE_CATALOG.filter(device => device.input).length, 9);
	assert.equal(REDSTONE_DEVICE_CATALOG.filter(device => device.output).length, 13);
	assert.equal(redstoneDeviceForBlock("createbedrock:red_nixie_tube")?.id, "nixie_tube");
});

test("analog levers preserve their full 0 through 15 native producer range", () => {
	let state = createRedstoneDeviceState("analog_lever");
	for (let index = 0; index < 15; index++)
		state = transitionRedstoneDevice(state, { type: "adjust", delta: 1 });
	assert.equal(nativeOutputPower(state), 15);
	state = transitionRedstoneDevice(state, { type: "adjust", delta: 1 });
	assert.equal(nativeOutputPower(state), 15);
	state = transitionRedstoneDevice(state, { type: "adjust", delta: -1 });
	assert.equal(nativeOutputPower(state), 14);
});

test("latches and pulse devices distinguish steady levels, rising edges, delays, and restartable timers", () => {
	assert.equal(createRedstoneDeviceState("pulse_extender").timerTicks, 2);
	assert.equal(createRedstoneDeviceState("pulse_repeater").timerTicks, 2);
	assert.equal(createRedstoneDeviceState("pulse_timer").timerTicks, 20);
	assert.throws(() => createRedstoneDeviceState("pulse_timer", { timerTicks: 1 }), /2 through/);
	let latch = createRedstoneDeviceState("powered_toggle_latch");
	latch = transitionRedstoneDevice(latch, { type: "input", power: 15 });
	assert.equal(nativeOutputPower(latch), 15);
	latch = transitionRedstoneDevice(latch, { type: "input", power: 15 });
	assert.equal(nativeOutputPower(latch), 15);
	latch = transitionRedstoneDevice(latch, { type: "input", power: 0 });
	latch = transitionRedstoneDevice(latch, { type: "input", power: 1 });
	assert.equal(nativeOutputPower(latch), 0);

	let extender = createRedstoneDeviceState("pulse_extender", { timerTicks: 3 });
	extender = transitionRedstoneDevice(extender, { type: "input", power: 15 });
	assert.equal(nativeOutputPower(extender), 15);
	assert.equal(nativeOutputPower(ticks(extender, 3)), 0);

	let repeater = createRedstoneDeviceState("pulse_repeater", { timerTicks: 2 });
	repeater = transitionRedstoneDevice(repeater, { type: "input", power: 15 });
	assert.equal(nativeOutputPower(repeater), 0);
	repeater = ticks(repeater, 2);
	assert.equal(nativeOutputPower(repeater), 15);
	assert.equal(nativeOutputPower(ticks(repeater, 1)), 0);

	let timer = createRedstoneDeviceState("pulse_timer", { timerTicks: 2 });
	timer = ticks(timer, 2);
	assert.equal(nativeOutputPower(timer), 15);
	timer = transitionRedstoneDevice(timer, { type: "input", power: 15 });
	assert.equal(nativeOutputPower(timer), 0);
});

test("observers, contacts, links, requester, stock, and displays retain only deterministic persisted state", () => {
	let observer = createRedstoneDeviceState("content_observer");
	observer = transitionRedstoneDevice(observer, { type: "observe", inventory: "0:minecraft:iron_ingot:1" });
	assert.equal(nativeOutputPower(observer), 15);
	assert.equal(nativeOutputPower(ticks(observer, 2)), 0);

	let contact = createRedstoneDeviceState("redstone_contact");
	contact = transitionRedstoneDevice(contact, { type: "set_contact", active: true });
	assert.equal(nativeOutputPower(contact), 15);

	let link = createRedstoneDeviceState("redstone_link", { mode: "receiver", frequency: ["minecraft:red_wool", "minecraft:blue_wool"] });
	assert.deepEqual(link.frequency, ["minecraft:red_wool", "minecraft:blue_wool"]);
	link = transitionRedstoneDevice(link, { type: "receive", power: 15 });
	assert.equal(nativeOutputPower(link), 15);
	link = transitionRedstoneDevice(link, { type: "receive", power: 6 });
	assert.equal(nativeOutputPower(link), 6);

	let requester = createRedstoneDeviceState("redstone_requester");
	requester = transitionRedstoneDevice(requester, { type: "input", power: 8 });
	assert.equal(requester.active, true);
	assert.equal(nativeOutputPower(requester), 0);
	requester = transitionRedstoneDevice(requester, { type: "request_result", nonce: 1, success: true });
	assert.equal(nativeOutputPower(requester), 15);
	assert.equal(requester.requestNonce, 1);
	requester = transitionRedstoneDevice(requester, { type: "request_result", inFlight: true, nonce: 2, status: "pending", success: false });
	assert.equal(requester.requestInFlight, true);
	assert.equal(requester.requestStatus, "pending");
	assert.equal(nativeOutputPower(requester), 0);
	requester = transitionRedstoneDevice(requester, { type: "request_progress", nonce: 2, status: "fulfilled" });
	assert.equal(requester.requestInFlight, false);
	assert.equal(nativeOutputPower(requester), 15);

	let stockLink = createRedstoneDeviceState("stock_link", { minimumStock: 2 });
	stockLink = transitionRedstoneDevice(stockLink, { type: "set_stock_available", active: false });
	const unchangedStockLink = transitionRedstoneDevice(stockLink, { type: "set_stock_available", active: false });
	assert.deepEqual(unchangedStockLink, stockLink);
	stockLink = transitionRedstoneDevice(stockLink, { type: "set_stock_available", active: true });
	assert.equal(nativeOutputPower(stockLink), 15);

	let speedController = createRedstoneDeviceState("rotation_speed_controller");
	speedController = transitionRedstoneDevice(speedController, { type: "configure", targetSpeed: -96 });
	speedController = transitionRedstoneDevice(speedController, { type: "input", power: 15 });
	assert.equal(speedController.active, false);
	assert.equal(speedController.targetSpeed, -96);

	let nixie = createRedstoneDeviceState("nixie_tube");
	nixie = transitionRedstoneDevice(nixie, { type: "input", power: 12 });
	assert.equal(nixie.displayValue, "12");
	assert.deepEqual(nixie.display.lines, ["12"]);
	assert.equal(nativeOutputPower(nixie), 0);
});

test("Nixie target text is versioned state that survives a state validation round trip", () => {
	let nixie = createRedstoneDeviceState("nixie_tube");
	nixie = transitionRedstoneDevice(nixie, { type: "set_display_text", text: "Assembly 7" });
	assert.equal(nixie.display.revision, 1);
	assert.equal(nixie.display.lines[0], "Assembly 7");
	assert.equal(nixie.displayValue, "Assembly 7");
	assert.equal(transitionRedstoneDevice(nixie, { type: "set_display_text", text: "Assembly 7" }).display.revision, 1);
	nixie = transitionRedstoneDevice(nixie, { type: "set_display_style", color: "green", brightness: 6 });
	assert.deepEqual(nixie.display.style, { color: "green", brightness: 6 });
});
