import assert from "node:assert/strict";
import test from "node:test";

import { formationForBogeys, normalizeBogeyRecord } from "../behavior_pack/scripts/trains/rolling-stock-state.js";

test("rolling stock derives authoritative spacing and carriage count from persisted bogeys", () => {
	const small = { dimensionId: "minecraft:overworld", id: "bogey:a", location: { x: 0, y: 64, z: 0 }, size: "small" };
	const large = { dimensionId: "minecraft:overworld", id: "bogey:b", location: { x: 2, y: 64, z: 0 }, size: "large" };
	assert.equal(normalizeBogeyRecord(small).style, "standard");
	assert.deepEqual(formationForBogeys([small, large]), { bogeyIds: ["bogey:a", "bogey:b"], carriageCount: 2, carriageSpacing: 4 });
});
