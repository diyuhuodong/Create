import assert from "node:assert/strict";
import test from "node:test";

import { partTypeFor } from "../behavior_pack/scripts/contraptions/contraption-parts.js";
import { isMovableBlockType } from "../behavior_pack/scripts/contraptions/movable-blocks.js";

test("Contraption part registry covers the currently movable kinetic blocks", () => {
	for (const typeId of [
		"createbedrock:shaft",
		"createbedrock:cogwheel",
		"createbedrock:large_cogwheel",
		"createbedrock:gearbox",
		"createbedrock:clutch",
		"createbedrock:millstone",
		"createbedrock:mechanical_press",
		"createbedrock:crushing_wheel"
	]) {
		assert.equal(isMovableBlockType(typeId), true);
		assert.match(partTypeFor(typeId), /^createbedrock:contraption_part_/);
	}
	assert.equal(isMovableBlockType("createbedrock:hand_crank"), false);
	assert.equal(partTypeFor("createbedrock:hand_crank"), undefined);
});
