import assert from "node:assert/strict";
import test from "node:test";

import { KineticWorld } from "../behavior_pack/scripts/kinetics/kinetic-world.js";

function block(typeId, x, y, z) {
	return {
		dimension: { id: "minecraft:overworld" },
		location: { x, y, z },
		typeId
	};
}

function facedBlock(typeId, x, y, z, facingDirection) {
	return {
		...block(typeId, x, y, z),
		permutation: { getAllStates: () => ({ "minecraft:facing_direction": facingDirection }) }
	};
}

test("KineticWorld tracks placement, hand-crank activation, and overload", () => {
	const world = new KineticWorld();
	const crank = block("createbedrock:hand_crank", 0, 64, 0);
	world.trackPlacedBlock(crank);
	world.trackPlacedBlock(block("createbedrock:shaft", 0, 65, 0));
	world.trackPlacedBlock(block("createbedrock:millstone", 0, 66, 0));

	assert.equal(world.activateHandCrank(crank), true);
	world.tick();

	const [network] = world.latestResolved;
	assert.equal(network.stalled, false);
	assert.equal(network.stressImpact, 8);
	assert.equal(network.nodeStates.at(-1).speed, 16);
});

test("KineticWorld removes a broken block from the next resolution", () => {
	const world = new KineticWorld();
	const crank = block("createbedrock:hand_crank", 0, 64, 0);
	const shaft = block("createbedrock:shaft", 0, 65, 0);
	world.trackPlacedBlock(crank);
	world.trackPlacedBlock(shaft);
	world.activateHandCrank(crank);
	world.tick();

	assert.equal(world.trackBrokenBlock("minecraft:overworld", shaft.location), true);
	world.tick();
	assert.equal(world.latestResolved.length, 1);
	assert.deepEqual(world.latestResolved[0].nodeIds, ["minecraft:overworld:0:64:0"]);
});

test("KineticWorld restores valid persisted nodes and ignores malformed entries", () => {
	const world = new KineticWorld();
	world.restore([
		{ dimensionId: "minecraft:overworld", location: { x: 0, y: 65, z: 0 }, typeId: "createbedrock:shaft" },
		{ dimensionId: "minecraft:overworld", location: { x: 0, y: 64, z: 0 }, typeId: "createbedrock:hand_crank" },
		{ dimensionId: "minecraft:overworld", location: { x: "bad", y: 64, z: 0 }, typeId: "createbedrock:shaft" },
		{ dimensionId: "minecraft:overworld", location: { x: 3, y: 64, z: 0 }, typeId: "createbedrock:unknown" }
	]);

	assert.deepEqual(world.snapshot(), [
		{ axis: "y", dimensionId: "minecraft:overworld", location: { x: 0, y: 64, z: 0 }, typeId: "createbedrock:hand_crank" },
		{ axis: "y", dimensionId: "minecraft:overworld", location: { x: 0, y: 65, z: 0 }, typeId: "createbedrock:shaft" }
	]);
});

test("KineticWorld only connects shafts along their rotation axis and meshes side-by-side cogwheels", () => {
	const world = new KineticWorld();
	const crank = block("createbedrock:hand_crank", 0, 64, 0);
	world.trackPlacedBlock(crank);
	world.trackPlacedBlock(block("createbedrock:shaft", 1, 64, 0));
	world.trackPlacedBlock(block("createbedrock:cogwheel", 0, 65, 0));
	world.trackPlacedBlock(block("createbedrock:cogwheel", -1, 65, 0));
	world.activateHandCrank(crank);
	world.tick();

	assert.equal(world.speedAt("minecraft:overworld", { x: 1, y: 64, z: 0 }), 0);
	assert.equal(world.speedAt("minecraft:overworld", { x: 0, y: 65, z: 0 }), 16);
	assert.equal(world.speedAt("minecraft:overworld", { x: -1, y: 65, z: 0 }), -16);
});

test("KineticWorld derives its rotation axis from Bedrock placement direction", () => {
	const world = new KineticWorld();
	const crank = facedBlock("createbedrock:hand_crank", 0, 64, 0, 4);
	world.trackPlacedBlock(crank);
	world.trackPlacedBlock(facedBlock("createbedrock:shaft", 1, 64, 0, 5));
	world.activateHandCrank(crank);
	world.tick();

	assert.equal(world.speedAt("minecraft:overworld", { x: 1, y: 64, z: 0 }), 16);
	assert.equal(world.snapshot()[0].axis, "x");
});
