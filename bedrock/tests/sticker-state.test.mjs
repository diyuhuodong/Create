import assert from "node:assert/strict";
import test from "node:test";

import { mergeAssemblyAttachmentLocations } from "../behavior_pack/scripts/contraptions/assembly-attachments.js";
import { createStickerState, normalizeStickerRecord, stickerAttachmentTarget } from "../behavior_pack/scripts/contraptions/sticker-state.js";

test("Sticker state preserves facing and only creates an edge while active", () => {
	const inactive = createStickerState({ active: 0, facing: "north" });
	assert.equal(stickerAttachmentTarget({ x: 4, y: 5, z: 6 }, inactive), undefined);
	const active = createStickerState({ active: 1, facing: 5 });
	assert.deepEqual(stickerAttachmentTarget({ x: 4, y: 5, z: 6 }, active), { x: 5, y: 5, z: 6 });
	assert.deepEqual(normalizeStickerRecord({
		dimensionId: "minecraft:overworld",
		location: { x: 4, y: 5, z: 6 },
		state: active
	}), {
		dimensionId: "minecraft:overworld",
		id: "sticker:minecraft:overworld:4:5:6",
		location: { x: 4, y: 5, z: 6 },
		state: active
	});
});

test("assembly attachment graph deduplicates shared edges and rejects self cycles", () => {
	assert.deepEqual(mergeAssemblyAttachmentLocations(
		{ x: 0, y: 0, z: 0 },
		[{ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }],
		[{ x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }]
	), [{ x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }]);
});
