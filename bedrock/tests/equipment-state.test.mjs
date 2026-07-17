import assert from "node:assert/strict";
import test from "node:test";

import { armPotatoCannon, backtankCapacity, consumeBacktankAir, createBacktankState, createPotatoCannonState, refillBacktank } from "../behavior_pack/scripts/equipment/equipment-state.js";
import { createToolboxState, extractToolboxStack, insertToolboxStack } from "../behavior_pack/scripts/equipment/toolbox-state.js";

test("Backtank state clamps to Java-derived capacity and uses speed-sensitive refills", () => {
	assert.equal(backtankCapacity(0), 900);
	assert.equal(backtankCapacity(3), 1800);
	const filled = refillBacktank(createBacktankState({ air: 895 }), { speed: 160 });
	assert.equal(filled.state.air, 898);
	assert.equal(filled.ticksUntilNextFill, 0);
	assert.equal(refillBacktank(filled.state, { speed: 256, waterlogged: true }).changed, false);
	assert.deepEqual(consumeBacktankAir(createBacktankState({ air: 1 }), 1), {
		consumed: true,
		state: createBacktankState({ air: 0, revision: 1 })
	});
});

test("Potato Cannon state rejects an overlapping fire and persists its cooldown", () => {
	const armed = armPotatoCannon(createPotatoCannonState(), { cooldownTicks: 12, now: 100 });
	assert.equal(armed.fired, true);
	assert.equal(armPotatoCannon(armed.state, { cooldownTicks: 12, now: 111 }).fired, false);
	assert.equal(armPotatoCannon(armed.state, { cooldownTicks: 12, now: 112 }).fired, true);
});

test("Toolbox compartments enforce one filter and preserve bounded stack transfers", () => {
	const state = createToolboxState({ color: "red", host: { kind: "item" }, toolboxId: "toolbox:test" });
	const inserted = insertToolboxStack(state, 0, { count: 16, typeId: "minecraft:andesite" }, "put:1");
	assert.equal(inserted.accepted.count, 16);
	assert.equal(insertToolboxStack(inserted.state, 0, { count: 1, typeId: "minecraft:iron_ingot" }, "put:2").accepted, undefined);
	const extracted = extractToolboxStack(inserted.state, 0, { maxCount: 8, receiptId: "take:1" });
	assert.equal(extracted.extracted.count, 8);
	assert.equal(extracted.state.compartments[0].slots[0].count, 8);
});
