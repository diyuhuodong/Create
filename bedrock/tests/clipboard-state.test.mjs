import assert from "node:assert/strict";
import test from "node:test";

import { CLIPBOARD_MAX_TEXT_LENGTH, createClipboardState, normalizeClipboardRecord } from "../behavior_pack/scripts/schematics/clipboard-state.js";

test("Clipboard state bounds editable text and persists a location-derived identity", () => {
	assert.deepEqual(createClipboardState({ revision: 4, text: "Assembly checklist" }), {
		revision: 4,
		schemaVersion: 1,
		text: "Assembly checklist"
	});
	assert.deepEqual(normalizeClipboardRecord({
		dimensionId: "minecraft:overworld",
		location: { x: 4, y: 64, z: -8 },
		state: { text: "Note" }
	}), {
		dimensionId: "minecraft:overworld",
		id: "clipboard:minecraft:overworld:4:64:-8",
		location: { x: 4, y: 64, z: -8 },
		state: { revision: 0, schemaVersion: 1, text: "Note" }
	});
	assert.throws(() => createClipboardState({ text: "x".repeat(CLIPBOARD_MAX_TEXT_LENGTH + 1) }), /at most/);
});
