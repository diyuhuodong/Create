import assert from "node:assert/strict";
import test from "node:test";

import { crushingBeltEndpoints, selectCrushingEntityInput } from "../behavior_pack/scripts/processing/crushing-wheel-belt-interface.js";

test("Crushing controller distinguishes belts feeding its center from belts carrying output away", () => {
	const endpoints = crushingBeltEndpoints({
		controller: { x: 10, y: 64, z: 10 },
		belts: [
			{ facing: "east", location: { x: 9, y: 64, z: 10 } },
			{ facing: "east", location: { x: 11, y: 64, z: 10 } }
		]
	});
	assert.deepEqual(endpoints.inputs.map(endpoint => endpoint.location), [{ x: 9, y: 64, z: 10 }]);
	assert.deepEqual(endpoints.outputs.map(endpoint => endpoint.location), [{ x: 11, y: 64, z: 10 }]);
});

test("Crushing controller claims one deterministic entity only while its wheel pair is active", () => {
	const endpoints = { inputs: [{ location: { x: 9, y: 64, z: 10 } }], outputs: [] };
	const entities = [
		{ id: "z", item: { count: 1, typeId: "minecraft:iron_ore" }, location: { x: 9.5, y: 64.5, z: 10.5 } },
		{ id: "a", item: { count: 1, typeId: "minecraft:copper_ore" }, location: { x: 10.5, y: 64.5, z: 10.5 } },
		{ id: "far", item: { count: 1, typeId: "minecraft:gold_ore" }, location: { x: 14, y: 64, z: 10 } }
	];
	assert.equal(selectCrushingEntityInput({ controller: { x: 10, y: 64, z: 10 }, endpoints, entities, pairActive: true }).id, "a");
	assert.equal(selectCrushingEntityInput({ controller: { x: 10, y: 64, z: 10 }, endpoints, entities, pairActive: false }), undefined);
});
