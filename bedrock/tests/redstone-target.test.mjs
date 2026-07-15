import assert from "node:assert/strict";
import test from "node:test";

import { COMPATIBILITY_REDSTONE_CONTROLS, FORBIDDEN_REDSTONE_COMPONENTS, hasCompatibilityEngineVersion, REDSTONE_COMPATIBILITY_TARGET } from "../behavior_pack/scripts/redstone/redstone-target.js";

test("S3-14 compatibility target only accepts the declared 1.21.80 Realm and console baseline", () => {
	assert.equal(hasCompatibilityEngineVersion([1, 21, 80]), true);
	assert.equal(hasCompatibilityEngineVersion([1, 21, 120]), false);
	assert.equal(hasCompatibilityEngineVersion([1, 21]), false);
	assert.equal(REDSTONE_COMPATIBILITY_TARGET.outputMode, "blocked");
	assert.deepEqual(FORBIDDEN_REDSTONE_COMPONENTS, ["minecraft:redstone_consumer", "minecraft:redstone_producer"]);
	assert.equal(COMPATIBILITY_REDSTONE_CONTROLS.length, 6);
});
