import assert from "node:assert/strict";
import test from "node:test";

import {
	DISPLAY_BOARD_BLOCK,
	collectDisplayBoardGroup,
	configureDisplayBoard,
	createDisplayBoardState,
	displayBoardCanRender,
	resizeDisplayBoardState
} from "../behavior_pack/scripts/materials/display-board.js";

function boardGrid({ facing = 2, height, width }) {
	const boards = new Map();
	for (let y = 0; y < height; y++)
		for (let x = 0; x < width; x++)
			boards.set(`${x}:${y}:0`, { facing, typeId: DISPLAY_BOARD_BLOCK });
	return location => boards.get(`${location.x}:${location.y}:${location.z}`);
}

test("Display Board groups use a same-facing lower-left controller and two lines per row", () => {
	const group = collectDisplayBoardGroup({
		anchor: { x: 1, y: 1, z: 0 },
		readBoard: boardGrid({ height: 2, width: 3 })
	});
	assert.deepEqual(group.root, { x: 0, y: 0, z: 0 });
	assert.equal(group.width, 3);
	assert.equal(group.height, 2);
	assert.equal(group.rectangular, true);
	assert.equal(group.members.length, 6);
	const resized = resizeDisplayBoardState(createDisplayBoardState({ lineCount: 2 }), 4);
	assert.equal(resized.lines.length, 4);
});

test("Display Board edits are revision guarded and display only while its kinetic speed is sufficient", () => {
	const initial = createDisplayBoardState({ lineCount: 2 });
	const conflict = configureDisplayBoard({ expectedRevision: 1, patch: { lines: ["A", "B"] }, state: initial });
	assert.equal(conflict.conflict, true);
	const configured = configureDisplayBoard({
		expectedRevision: 0,
		patch: { color: "green", glowing: true, lines: ["Create", "Bedrock"] },
		state: initial
	});
	assert.equal(configured.changed, true);
	assert.equal(displayBoardCanRender(configured.state, 0), false);
	assert.equal(displayBoardCanRender(configured.state, 16), true);
});
