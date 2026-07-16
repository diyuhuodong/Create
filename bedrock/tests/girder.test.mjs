import assert from "node:assert/strict";
import test from "node:test";

import { bracketTypeForNeighbor, girderShapeForConnections } from "../behavior_pack/scripts/materials/girder.js";

test("metal girders select pole, axial, and cross geometry from adjacent girders", () => {
	assert.equal(girderShapeForConnections(), "pole");
	assert.equal(girderShapeForConnections({ xPositive: true }), "x");
	assert.equal(girderShapeForConnections({ zNegative: true }), "z");
	assert.equal(girderShapeForConnections({ xNegative: true, zPositive: true }), "cross");
});

test("brackets classify the supported Create pipe, cog, and shaft families", () => {
	assert.equal(bracketTypeForNeighbor("createbedrock:fluid_pipe"), "pipe");
	assert.equal(bracketTypeForNeighbor("createbedrock:cogwheel"), "cog");
	assert.equal(bracketTypeForNeighbor("createbedrock:shaft"), "shaft");
	assert.equal(bracketTypeForNeighbor("minecraft:stone"), undefined);
});
