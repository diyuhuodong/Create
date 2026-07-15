import assert from "node:assert/strict";
import test from "node:test";

import { createDisplayTargetState, writeDisplayTargetLine } from "../behavior_pack/scripts/redstone/display-target.js";
import { collectNixieTubeGroup, composeNixieTubeDisplay, nixieTubeGroupDirection, nixieTubeGroupId } from "../behavior_pack/scripts/redstone/nixie-display.js";

function tube(location, text) {
	return {
		typeId: "createbedrock:nixie_tube",
		facing: "north",
		location,
		display: writeDisplayTargetLine(createDisplayTargetState({ color: "yellow", brightness: 9 }), { text }).state
	};
}

test("Nixie groups collect same-facing contiguous tubes and compose persisted text", () => {
	const tubes = [tube({ x: 0, y: 64, z: 0 }, "A"), tube({ x: 1, y: 64, z: 0 }, "2"), tube({ x: 2, y: 64, z: 0 }, "!")];
	const group = collectNixieTubeGroup({
		anchor: { x: 1, y: 64, z: 0 },
		readTube(location) {
			return tubes.find(entry => entry.location.x === location.x && entry.location.y === location.y && entry.location.z === location.z);
		}
	});
	assert.deepEqual(group.tubes.map(entry => entry.location.x), [0, 1, 2]);
	assert.deepEqual(composeNixieTubeDisplay(group), { style: { brightness: 9, color: "yellow" }, text: "A2!" });
	assert.equal(nixieTubeGroupId("minecraft:overworld", group), "nixie:minecraft:overworld:0:64:0:north");
});

test("Nixie group axes stay perpendicular to each supported facing", () => {
	assert.deepEqual(nixieTubeGroupDirection("north"), { x: 1, y: 0, z: 0 });
	assert.deepEqual(nixieTubeGroupDirection("east"), { x: 0, y: 0, z: 1 });
	assert.deepEqual(nixieTubeGroupDirection("up"), { x: 1, y: 0, z: 0 });
});
