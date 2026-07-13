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

function stateBlock(typeId, x, y, z, states) {
	return {
		...block(typeId, x, y, z),
		permutation: { getAllStates: () => states }
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

test("KineticWorld propagates and persists generated source speed", () => {
	const world = new KineticWorld();
	const wheel = block("createbedrock:water_wheel", 0, 64, 0);
	const shaft = block("createbedrock:shaft", 0, 65, 0);
	world.trackPlacedBlock(wheel);
	world.trackPlacedBlock(shaft);
	assert.equal(world.setGeneratedSpeed("minecraft:overworld", wheel.location, 8), true);
	world.tick();
	assert.equal(world.speedAt("minecraft:overworld", shaft.location), 8);

	const restored = new KineticWorld();
	restored.restore(world.snapshot());
	restored.tick();
	assert.equal(restored.speedAt("minecraft:overworld", shaft.location), 8);
	assert.equal(restored.setGeneratedSpeed("minecraft:overworld", wheel.location, 0), true);
	restored.tick();
	assert.equal(restored.speedAt("minecraft:overworld", shaft.location), 0);
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

	assert.deepEqual(world.snapshot(), {
		beltLinks: [],
		nodes: [
			{ axis: "y", dimensionId: "minecraft:overworld", location: { x: 0, y: 64, z: 0 }, typeId: "createbedrock:hand_crank" },
			{ axis: "y", dimensionId: "minecraft:overworld", location: { x: 0, y: 65, z: 0 }, typeId: "createbedrock:shaft" }
		],
		schemaVersion: 2
	});
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
	assert.equal(world.snapshot().nodes[0].axis, "x");
});

test("KineticWorld applies the large-to-small cogwheel ratio", () => {
	const world = new KineticWorld();
	const crank = block("createbedrock:hand_crank", 0, 64, 0);
	world.trackPlacedBlock(crank);
	world.trackPlacedBlock(block("createbedrock:shaft", 0, 65, 0));
	world.trackPlacedBlock(block("createbedrock:large_cogwheel", 0, 66, 0));
	world.trackPlacedBlock(block("createbedrock:cogwheel", 1, 66, 0));
	world.activateHandCrank(crank);
	world.tick();

	assert.equal(world.speedAt("minecraft:overworld", { x: 1, y: 66, z: 0 }), -32);
});

test("KineticWorld uses a gearbox to redirect power across rotation axes", () => {
	const world = new KineticWorld();
	const crank = block("createbedrock:hand_crank", 0, 64, 0);
	world.trackPlacedBlock(crank);
	world.trackPlacedBlock(block("createbedrock:gearbox", 0, 65, 0));
	world.trackPlacedBlock(facedBlock("createbedrock:shaft", 1, 65, 0, 4));
	world.activateHandCrank(crank);
	world.tick();

	assert.equal(world.speedAt("minecraft:overworld", { x: 1, y: 65, z: 0 }), 16);
});

test("KineticWorld lets an enabled clutch pass power and a disabled clutch isolate it", () => {
	const world = new KineticWorld();
	const crank = block("createbedrock:hand_crank", 0, 64, 0);
	const disabledClutch = stateBlock("createbedrock:clutch", 0, 65, 0, { "createbedrock:enabled": 0 });
	const enabledClutch = stateBlock("createbedrock:clutch", 0, 65, 0, { "createbedrock:enabled": 1 });
	const shaft = block("createbedrock:shaft", 0, 66, 0);
	world.trackPlacedBlock(crank);
	world.trackPlacedBlock(disabledClutch);
	world.trackPlacedBlock(shaft);
	world.activateHandCrank(crank);
	world.tick();
	assert.equal(world.speedAt("minecraft:overworld", shaft.location), 0);

	world.trackPlacedBlock(enabledClutch);
	world.tick();
	assert.equal(world.speedAt("minecraft:overworld", shaft.location), 16);
	assert.equal(world.snapshot().nodes.find(node => node.typeId === "createbedrock:clutch").enabled, true);
});

test("KineticWorld transmits across a perpendicular encased chain-drive run", () => {
	const world = new KineticWorld();
	const crank = block("createbedrock:hand_crank", 0, 64, 0);
	world.trackPlacedBlock(crank);
	world.trackPlacedBlock(block("createbedrock:shaft", 0, 65, 0));
	world.trackPlacedBlock(block("createbedrock:encased_chain_drive", 0, 66, 0));
	world.trackPlacedBlock(block("createbedrock:encased_chain_drive", 0, 66, 1));
	const output = block("createbedrock:shaft", 0, 67, 1);
	world.trackPlacedBlock(output);
	world.activateHandCrank(crank);
	world.tick();

	assert.equal(world.speedAt("minecraft:overworld", output.location), 16);
});

test("KineticWorld transmits speed across persisted shaft belt links", () => {
	const world = new KineticWorld();
	const crank = block("createbedrock:hand_crank", 0, 64, 0);
	const firstShaft = block("createbedrock:shaft", 0, 65, 0);
	const secondShaft = block("createbedrock:shaft", 8, 65, 0);
	world.trackPlacedBlock(crank);
	world.trackPlacedBlock(firstShaft);
	world.trackPlacedBlock(secondShaft);
	assert.deepEqual(world.connectBelt("minecraft:overworld", firstShaft.location, secondShaft.location), { ok: true });
	world.activateHandCrank(crank);
	world.tick();

	assert.equal(world.speedAt("minecraft:overworld", secondShaft.location), 16);
	const snapshot = world.snapshot();
	assert.equal(snapshot.beltLinks.length, 1);

	const restored = new KineticWorld();
	restored.restore(snapshot);
	restored.activateHandCrank(crank);
	restored.tick();
	assert.equal(restored.speedAt("minecraft:overworld", secondShaft.location), 16);
});

test("KineticWorld rejects invalid belt geometry and removes links when a pulley breaks", () => {
	const world = new KineticWorld();
	const firstShaft = block("createbedrock:shaft", 0, 64, 0);
	const tooFar = block("createbedrock:shaft", 21, 64, 0);
	const diagonalVertical = block("createbedrock:shaft", 4, 64, 4);
	const valid = block("createbedrock:shaft", 8, 64, 0);
	world.trackPlacedBlock(firstShaft);
	world.trackPlacedBlock(tooFar);
	world.trackPlacedBlock(diagonalVertical);
	world.trackPlacedBlock(valid);

	assert.deepEqual(world.connectBelt("minecraft:overworld", firstShaft.location, tooFar.location), { ok: false, reason: "invalid_path" });
	assert.deepEqual(world.connectBelt("minecraft:overworld", firstShaft.location, diagonalVertical.location), { ok: false, reason: "invalid_path" });
	assert.deepEqual(world.connectBelt("minecraft:overworld", firstShaft.location, valid.location), { ok: true });
	assert.equal(world.trackBrokenBlock("minecraft:overworld", valid.location), true);
	assert.equal(world.snapshot().beltLinks.length, 0);
});

test("KineticWorld diagnostics report indexed nodes per dimension", () => {
	const world = new KineticWorld();
	world.trackPlacedBlock(block("createbedrock:shaft", 0, 64, 0));
	world.trackPlacedBlock({
		...block("createbedrock:cogwheel", 0, 64, 0),
		dimension: { id: "minecraft:nether" }
	});

	assert.deepEqual(world.diagnostics(), {
		beltLinks: 0,
		nodes: 2,
		nodesByDimension: { "minecraft:overworld": 1, "minecraft:nether": 1 },
		resolvedNetworks: 0
	});
});
