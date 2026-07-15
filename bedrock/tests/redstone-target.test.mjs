import assert from "node:assert/strict";
import test from "node:test";

import { COMPATIBILITY_REDSTONE_CONTROLS, hasCompatibilityEngineVersion, NATIVE_REDSTONE_COMPONENTS, NATIVE_REDSTONE_SCRIPT_API_VERSION, REDSTONE_COMPATIBILITY_TARGET } from "../behavior_pack/scripts/redstone/redstone-target.js";

test("S3-14 native target only accepts the declared 1.26.0 Realm and console baseline", () => {
	assert.equal(hasCompatibilityEngineVersion([1, 26, 0]), true);
	assert.equal(hasCompatibilityEngineVersion([1, 21, 120]), false);
	assert.equal(hasCompatibilityEngineVersion([1, 21]), false);
	assert.equal(REDSTONE_COMPATIBILITY_TARGET.outputMode, "native_components_pending_implementation");
	assert.deepEqual(NATIVE_REDSTONE_COMPONENTS, ["minecraft:redstone_consumer", "minecraft:redstone_producer"]);
	assert.equal(NATIVE_REDSTONE_SCRIPT_API_VERSION, "2.5.0");
	assert.equal(COMPATIBILITY_REDSTONE_CONTROLS.length, 6);
});
