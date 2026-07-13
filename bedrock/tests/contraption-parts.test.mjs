import assert from "node:assert/strict";
import test from "node:test";

import { partTypeFor } from "../behavior_pack/scripts/contraptions/contraption-parts.js";
import { isMovableBlockType, MAX_CONTRAPTION_BLOCKS } from "../behavior_pack/scripts/contraptions/movable-blocks.js";

test("Contraption part registry covers the currently movable kinetic blocks", () => {
	assert.equal(MAX_CONTRAPTION_BLOCKS, 16);
	for (const typeId of [
		"createbedrock:hand_crank",
		"createbedrock:shaft",
		"createbedrock:cogwheel",
		"createbedrock:large_cogwheel",
		"createbedrock:gearbox",
		"createbedrock:clutch",
		"createbedrock:encased_chain_drive",
		"createbedrock:water_wheel",
		"createbedrock:millstone",
		"createbedrock:mechanical_press",
		"createbedrock:crushing_wheel"
	]) {
		assert.equal(isMovableBlockType(typeId), true);
		assert.match(partTypeFor(typeId), /^createbedrock:contraption_part_/);
	}
	assert.equal(isMovableBlockType("createbedrock:track"), false);
	assert.equal(partTypeFor("createbedrock:track"), undefined);
});
