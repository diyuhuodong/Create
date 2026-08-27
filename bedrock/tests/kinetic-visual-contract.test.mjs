import assert from "node:assert/strict";
import test from "node:test";

import { KINETIC_VISUAL_ENTITY_TYPES, kineticVisualAxis, kineticVisualForBlock, kineticVisualId } from "../behavior_pack/scripts/kinetics/kinetic-visual-contract.js";

test("kinetic visual contract maps the first dynamic kinetic blocks to dedicated entities", () => {
	assert.equal(kineticVisualForBlock("createbedrock:creative_motor").hidesBlock, false);
	assert.equal(kineticVisualForBlock("createbedrock:creative_motor").usesFacing, true);
	assert.equal(kineticVisualForBlock("createbedrock:shaft").entityType, "createbedrock:shaft_visual");
	assert.equal(kineticVisualForBlock("createbedrock:crushing_wheel").entityType, "createbedrock:crushing_wheel_visual");
	assert.equal(KINETIC_VISUAL_ENTITY_TYPES.length, 5);
	assert.equal(kineticVisualForBlock("minecraft:stone"), undefined);
});

test("kinetic visuals encode rotation axes and stable source identities", () => {
	assert.equal(kineticVisualAxis("x"), 0);
	assert.equal(kineticVisualAxis("y"), 1);
	assert.equal(kineticVisualAxis("z"), 2);
	assert.equal(kineticVisualAxis("unknown"), 1);
	assert.equal(kineticVisualId("minecraft:overworld", { x: -4, y: 64, z: 12 }), "minecraft:overworld:-4:64:12");
	assert.throws(() => kineticVisualId("minecraft:overworld", { x: 0.5, y: 64, z: 0 }));
});
