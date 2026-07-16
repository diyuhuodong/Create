import assert from "node:assert/strict";
import test from "node:test";

import {
	actorTraversal,
	canHarvestBlock,
	canDrillBlock,
	controlsDisableActor,
	drillTargetCell,
	ploughMutationFor,
	normalizeActorItemState,
	rollerWorkCells,
	transferPortableInterfaceItem
} from "../behavior_pack/scripts/contraptions/contraption-actors.js";

test("Contraption actor traversal is block-complete and controls filter actor types", () => {
	assert.deepEqual(actorTraversal({ x: .1, y: .5, z: .1 }, { x: 2.8, y: .5, z: .1 }), [
		{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }
	]);
	assert.equal(controlsDisableActor([{ disabled: true, filter: "createbedrock:mechanical_plough" }], "createbedrock:mechanical_plough"), true);
	assert.equal(controlsDisableActor([{ disabled: true, filter: "createbedrock:mechanical_plough" }], "createbedrock:mechanical_roller"), false);
});

test("Plough, roller, and portable-interface primitives keep their world mutation contracts", () => {
	assert.deepEqual(ploughMutationFor("minecraft:dirt"), { typeId: "minecraft:farmland" });
	assert.equal(ploughMutationFor("minecraft:stone"), undefined);
	assert.equal(rollerWorkCells({ x: 2.5, y: 4.5, z: 3.5 }, { x: 0, y: 0, z: 1 }, 2).length, 3);
	const transfer = transferPortableInterfaceItem({ slots: [{ typeId: "minecraft:iron_ingot", count: 2 }, ...Array(8)] }, { slots: Array(9) });
	assert.equal(transfer.changed, true);
	assert.deepEqual(transfer.source.slots[0], { typeId: "minecraft:iron_ingot", count: 1 });
	assert.deepEqual(transfer.destination.slots[0], { typeId: "minecraft:iron_ingot", count: 1 });
});

test("Mechanical drills target their transformed facing cell without breaking protected world blocks", () => {
	assert.deepEqual(drillTargetCell({ x: 2.5, y: 4.5, z: 3.5 }, { x: 0, y: 0, z: -1 }), { x: 2, y: 4, z: 2 });
	assert.equal(canDrillBlock("minecraft:stone"), true);
	assert.equal(canDrillBlock("minecraft:bedrock"), false);
	assert.equal(canDrillBlock("minecraft:water"), false);
});

test("Deployer, Harvester, and Mechanical Arm retain bounded persistent actor state", () => {
	assert.deepEqual(normalizeActorItemState({ heldItem: { count: 3, typeId: "minecraft:oak_planks" } }), {
		cooldown: 0,
		heldItem: { count: 3, typeId: "minecraft:oak_planks" }
	});
	assert.equal(canHarvestBlock({ permutation: { getAllStates: () => ({ growth: 7 }) }, typeId: "minecraft:wheat" }), true);
	assert.equal(canHarvestBlock({ permutation: { getAllStates: () => ({ growth: 6 }) }, typeId: "minecraft:wheat" }), false);
	assert.throws(() => normalizeActorItemState({ heldItem: { count: 65, typeId: "minecraft:stone" } }));
});
