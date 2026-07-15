import assert from "node:assert/strict";
import test from "node:test";

import { RedstoneSignalBus, redstoneControlId } from "../behavior_pack/scripts/redstone/redstone-signal-bus.js";

function device(type, x) {
	const location = { x, y: 64, z: 0 };
	return {
		dimensionId: "minecraft:overworld",
		id: redstoneControlId("minecraft:overworld", location),
		location,
		type
	};
}

test("redstone control IDs are location-stable and reject mismatched registrations", () => {
	assert.equal(redstoneControlId("minecraft:overworld", { x: -2, y: 64, z: 3 }), "redstone-control:minecraft:overworld:-2:64:3");
	const bus = new RedstoneSignalBus();
	assert.throws(() => bus.register({ ...device("clutch", 0), id: "redstone-control:wrong" }), /match their fixed location/);
});

test("RedstoneSignalBus polls registered controls in a bounded deterministic order and only publishes transitions", () => {
	const events = [];
	const powers = new Map([["clutch", 0], ["funnel", 9]]);
	const bus = new RedstoneSignalBus({
		onSignal(event) {
			events.push({ available: event.available, power: event.power, type: event.device.type });
		},
		readsPerTick: 2
	});
	bus.register(device("funnel", 2));
	bus.register(device("clutch", 1));
	assert.equal(bus.tick(control => powers.get(control.type)).processed, 2);
	assert.deepEqual(events, [
		{ available: true, power: 0, type: "clutch" },
		{ available: true, power: 9, type: "funnel" }
	]);
	assert.equal(bus.tick(control => powers.get(control.type)).processed, 2);
	assert.equal(events.length, 2);
	powers.set("funnel", 0);
	bus.tick(control => powers.get(control.type), { budget: 1 });
	assert.equal(events.length, 2);
	bus.tick(control => powers.get(control.type), { budget: 1 });
	assert.deepEqual(events.at(-1), { available: true, power: 0, type: "funnel" });
});

test("RedstoneSignalBus publishes one fail-closed unavailable state and resumes on a later sample", () => {
	const events = [];
	const bus = new RedstoneSignalBus({ onSignal: event => events.push({ available: event.available, power: event.power }) });
	bus.register(device("pump", 1));
	bus.tick(() => 6);
	bus.tick(() => undefined);
	bus.tick(() => undefined);
	bus.tick(() => ({ available: true, power: 0 }));
	assert.deepEqual(events, [
		{ available: true, power: 6 },
		{ available: false, power: undefined },
		{ available: true, power: 0 }
	]);
});

test("RedstoneSignalBus snapshots only fixed device descriptors and replays them after restart", () => {
	const source = new RedstoneSignalBus();
	source.register(device("clutch", 1));
	source.register(device("pump", 2));
	source.tick(() => 15);
	const restoredEvents = [];
	const restored = new RedstoneSignalBus({ onSignal: event => restoredEvents.push(event) });
	restored.restore(source.snapshot());
	assert.deepEqual(restored.devices(), source.devices());
	restored.tick(() => 0);
	assert.equal(restoredEvents.length, 2);
	assert.ok(restoredEvents.every(event => event.available && event.power === 0));
});

test("RedstoneSignalBus coalesces conflicting registrations at one fixed location", () => {
	const events = [];
	const bus = new RedstoneSignalBus({ onSignal: event => events.push(event) });
	assert.equal(bus.register(device("clutch", 4)), true);
	assert.equal(bus.register(device("pump", 4)), true);
	assert.deepEqual(bus.devices().map(control => control.type), ["pump"]);
	bus.tick(() => 0);
	assert.equal(events.length, 1);
	assert.equal(events[0].device.type, "pump");
});

test("RedstoneSignalBus accepts immediate native-event samples without waiting for a poll", () => {
	const events = [];
	const bus = new RedstoneSignalBus({ onSignal: event => events.push(event) });
	const control = device("clutch", 8);
	bus.register(control);
	assert.equal(bus.publish(control.id, { available: true, power: 13 }), true);
	assert.equal(bus.publish(control.id, { available: true, power: 13 }), false);
	assert.equal(bus.publish("redstone-control:minecraft:overworld:99:64:0", 0), false);
	assert.deepEqual(events.map(event => ({ power: event.power, available: event.available })), [{ power: 13, available: true }]);
});
