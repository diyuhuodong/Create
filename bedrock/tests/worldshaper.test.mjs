import assert from "node:assert/strict";
import test from "node:test";

import {
	WORLDSHAPER_ITEM,
	WORLDSHAPER_STATE_PROPERTY,
	createWorldshaperState,
	effectiveWorldshaperTool,
	isWorldshaperPatternIncluded,
	resolveWorldshaperTargets,
	stateForWorldshaperItem,
	writeWorldshaperItemState
} from "../behavior_pack/scripts/materials/worldshaper.js";

function itemStack() {
	const properties = new Map();
	return {
		typeId: WORLDSHAPER_ITEM,
		getDynamicProperty(key) { return properties.get(key); },
		setDynamicProperty(key, value) { properties.set(key, value); }
	};
}

test("Creative Worldshaper persists independent material and brush settings on its item stack", () => {
	const item = itemStack();
	const settings = createWorldshaperState({
		brush: "cylinder",
		params: [3, 4, 1],
		selected: { states: { "minecraft:cardinal_direction": "north" }, typeId: "minecraft:stone" },
		tool: "replace"
	});
	writeWorldshaperItemState(item, settings);
	const restored = stateForWorldshaperItem(item);
	assert.equal(restored.brush, "cylinder");
	assert.deepEqual(restored.params, [3, 4, 1]);
	assert.equal(restored.selected.typeId, "minecraft:stone");
	assert.equal(typeof item.getDynamicProperty(WORLDSHAPER_STATE_PROPERTY), "string");
});

test("Worldshaper cubic, spherical, and patterned targets remain bounded and deterministic", () => {
	const cuboid = resolveWorldshaperTargets({
		face: "up",
		readBlock: () => ({ typeId: "minecraft:stone" }),
		settings: createWorldshaperState({ brush: "cuboid", params: [3, 2, 1], pattern: "solid" }),
		target: { x: 0, y: 0, z: 0 }
	});
	assert.equal(cuboid.length, 6);
	assert.deepEqual(cuboid[0], { x: -1, y: 0, z: 0 });

	const sphere = resolveWorldshaperTargets({
		face: "up",
		readBlock: () => ({ typeId: "minecraft:stone" }),
		settings: createWorldshaperState({ brush: "sphere", params: [1, 1, 1], pattern: "solid" }),
		target: { x: 0, y: 0, z: 0 }
	});
	assert.equal(sphere.length, 19);
	assert.equal(isWorldshaperPatternIncluded("checkered", { x: 1, y: 0, z: 0 }), true);
	assert.equal(isWorldshaperPatternIncluded("inverse_checkered", { x: 1, y: 0, z: 0 }), false);
});

test("Surface and cluster brushes traverse only matching materials within their configured range", () => {
	const blocks = new Map([
		["0:0:0", { typeId: "minecraft:stone" }],
		["1:0:0", { typeId: "minecraft:stone" }],
		["2:0:0", { typeId: "minecraft:dirt" }],
		["1:1:0", { typeId: "minecraft:stone" }]
	]);
	const positions = resolveWorldshaperTargets({
		face: "up",
		readBlock: location => blocks.get(`${location.x}:${location.y}:${location.z}`),
		settings: createWorldshaperState({ brush: "cluster", params: [3, 1, 1], tool: "replace" }),
		target: { x: 0, y: 0, z: 0 }
	});
	assert.deepEqual(positions.sort((left, right) => left.x - right.x || left.y - right.y), [
		{ x: 0, y: 0, z: 0 },
		{ x: 1, y: 0, z: 0 },
		{ x: 1, y: 1, z: 0 }
	]);
	assert.equal(effectiveWorldshaperTool(createWorldshaperState({ brush: "surface", tool: "overlay" })), "place");
});
