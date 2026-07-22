import assert from "node:assert/strict";
import test from "node:test";

import { createDisplayTargetState, normalizeDisplayTargetState, resolveDisplayLinkWrite, writeDisplayTargetLine } from "../behavior_pack/scripts/redstone/display-target.js";

test("Display targets persist versioned lines and change only the addressed line", () => {
	const empty = createDisplayTargetState({ lineCount: 2, color: "green", brightness: 11 });
	const changed = writeDisplayTargetLine(empty, { line: 1, text: "12" });
	assert.equal(changed.changed, true);
	assert.deepEqual(changed.state, {
		schemaVersion: 1,
		revision: 1,
		lines: ["", "12"],
		style: { brightness: 11, color: "green" }
	});
	assert.equal(writeDisplayTargetLine(changed.state, { line: 1, text: "12" }).changed, false);
	assert.equal(normalizeDisplayTargetState(undefined).lines[0], "");
	assert.throws(() => writeDisplayTargetLine(empty, { line: 2, text: "outside" }), /line/);
});

test("Display Link resolves saved source and target offsets into one redstone text write", () => {
	const seen = [];
	const write = resolveDisplayLinkWrite({
		configuration: { settings: { sourceOffsetX: -2, targetLine: 1, targetOffsetY: 3 } },
		location: { x: 10, y: 64, z: 10 },
		readSource(source) {
			seen.push(source);
			return 13;
		}
	});
	assert.deepEqual(seen, [{ kind: "redstone_power", location: { x: 8, y: 64, z: 9 } }]);
	assert.deepEqual(write, {
		line: 1,
		source: { x: 8, y: 64, z: 9 },
		sourceKind: "redstone_power",
		sourceLine: 0,
		target: { x: 10, y: 67, z: 11 },
		text: "13"
	});
	assert.throws(() => resolveDisplayLinkWrite({ configuration: { settings: { sourceLine: 1 } }, location: { x: 0, y: 0, z: 0 }, readSource: () => ["first"] }), /line 1/);
});
