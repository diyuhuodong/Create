import assert from "node:assert/strict";
import test from "node:test";

import { validateStage4P42LinearActuators } from "../tools/stage4-p42-linear-actuator-contract.mjs";

test("P4.2 linear actuators share the dynamic assembly authority and define all tracked resources", async () => {
	assert.deepEqual(await validateStage4P42LinearActuators(), {
		blocks: 9,
		drivers: 5,
		entries: 15,
		transientBlocks: 3
	});
});
