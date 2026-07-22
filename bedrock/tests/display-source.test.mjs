import assert from "node:assert/strict";
import test from "node:test";

import {
	DISPLAY_SOURCE_KINDS,
	DISPLAY_TARGET_KINDS,
	displaySourceProviderKinds,
	normalizeDisplaySourceLines,
	registerDisplaySourceProvider,
	resolveDisplaySource
} from "../behavior_pack/scripts/redstone/display-source.js";

test("Display Source catalog covers Java's portable source and target families", () => {
	assert.equal(DISPLAY_SOURCE_KINDS.length, 26);
	assert.deepEqual(DISPLAY_TARGET_KINDS, ["nixie_tube", "display_board", "sign", "lectern"]);
	assert.deepEqual(normalizeDisplaySourceLines([12, "Create"]), ["12", "Create"]);
	assert.throws(() => normalizeDisplaySourceLines(["too\nlong"]), /single-line/);
});

test("Display Source adapters are optional extensions rather than Display Link imports", () => {
	const unregister = registerDisplaySourceProvider("time_of_day", () => ["06:00"]);
	try {
		assert.deepEqual(resolveDisplaySource({ kind: "time_of_day", location: { x: 0, y: 0, z: 0 } }), ["06:00"]);
		assert.ok(displaySourceProviderKinds().includes("time_of_day"));
		assert.equal(resolveDisplaySource({ kind: "boiler", location: { x: 0, y: 0, z: 0 } }), undefined);
	} finally {
		unregister();
	}
});
