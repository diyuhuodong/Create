import assert from "node:assert/strict";
import test from "node:test";

import { fingerprintInventoryStacks } from "../behavior_pack/scripts/redstone/redstone-inventory-fingerprint.js";

test("content observer item filters ignore unrelated slots while retaining slot and count changes", () => {
	const initial = [
		{ amount: 2, typeId: "minecraft:iron_ingot" },
		{ amount: 1, typeId: "minecraft:gold_ingot" },
		undefined
	];
	const unrelatedChange = [
		{ amount: 2, typeId: "minecraft:iron_ingot" },
		{ amount: 5, typeId: "minecraft:gold_ingot" },
		undefined
	];
	const matchingChange = [
		{ amount: 3, typeId: "minecraft:iron_ingot" },
		{ amount: 5, typeId: "minecraft:gold_ingot" },
		undefined
	];

	assert.equal(
		fingerprintInventoryStacks(initial, "minecraft:iron_ingot"),
		fingerprintInventoryStacks(unrelatedChange, "minecraft:iron_ingot")
	);
	assert.notEqual(
		fingerprintInventoryStacks(initial, "minecraft:iron_ingot"),
		fingerprintInventoryStacks(matchingChange, "minecraft:iron_ingot")
	);
	assert.notEqual(fingerprintInventoryStacks(initial), fingerprintInventoryStacks(unrelatedChange));
	assert.throws(() => fingerprintInventoryStacks([{ amount: 0, typeId: "minecraft:iron_ingot" }]), /positive integer/);
});
