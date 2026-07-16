import assert from "node:assert/strict";
import test from "node:test";

import { CONTRAPTION_CONTROLS_BLOCK } from "../behavior_pack/scripts/contraptions/contraption-actors.js";
import { validateStage4P41Foundation } from "../tools/stage4-p41-foundation-contract.mjs";

test("P4.1 uses Contraption Controls' distinct Java registration instead of the unrelated controls block", async () => {
	assert.equal(CONTRAPTION_CONTROLS_BLOCK, "createbedrock:contraption_controls");
	assert.deepEqual(await validateStage4P41Foundation(), {
		deferredSurvivalAcquisition: "create:electron_tube",
		entries: 4,
		projections: 2
	});
});
