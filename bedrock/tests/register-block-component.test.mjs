import assert from "node:assert/strict";
import test from "node:test";

import { registerBlockComponent } from "../behavior_pack/scripts/kernel/register-block-component.js";

test("block component registration accepts Bedrock reload duplicates only", () => {
	const calls = [];
	assert.equal(registerBlockComponent({ registerCustomComponent(id) { calls.push(id); } }, "createbedrock:test", {}), true);
	assert.deepEqual(calls, ["createbedrock:test"]);
	assert.equal(registerBlockComponent({ registerCustomComponent() { throw { name: "BlockCustomComponentAlreadyRegisteredError" }; } }, "createbedrock:test", {}), false);
	assert.throws(() => registerBlockComponent({ registerCustomComponent() { throw new Error("registry unavailable"); } }, "createbedrock:test", {}), /registry unavailable/);
});
