import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { FluidTank } from "../behavior_pack/scripts/fluids/fluid-tank.js";
import { ItemPort } from "../behavior_pack/scripts/logistics/item-port.js";
import { SequencedAssemblyController } from "../behavior_pack/scripts/processing/sequenced-assembly-controller.js";
import { matchesSequencedAssemblyTag } from "../behavior_pack/scripts/processing/sequenced-assembly-tags.js";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(testDirectory, "..");
const recipes = await readFile(resolve(bedrockRoot, "data", "recipes", "sequenced-assembly.json"), "utf8").then(JSON.parse).then(document => document.recipes);

const matchesTag = matchesSequencedAssemblyTag;

test("sequenced-assembly controller consumes station resources exactly once and flushes a completed output", () => {
	const controller = new SequencedAssemblyController(recipes, { id: "test:precision" });
	const input = new ItemPort({ id: "test:input", size: 1, slots: [{ count: 1, typeId: "createbedrock:golden_sheet" }] });
	const cogs = new ItemPort({ id: "test:cogs", size: 1, slots: [{ count: 5, typeId: "createbedrock:cogwheel" }] });
	const largeCogs = new ItemPort({ id: "test:large-cogs", size: 1, slots: [{ count: 5, typeId: "createbedrock:large_cogwheel" }] });
	const nuggets = new ItemPort({ id: "test:nuggets", size: 1, slots: [{ count: 5, typeId: "minecraft:iron_nugget" }] });
	assert.equal(controller.start("create:sequenced_assembly/precision_mechanism", input, { matchesTag }).accepted, true);
	for (let index = 0; index < 5; index++) {
		assert.equal(controller.apply("create:deploying", { itemPort: cogs, matchesTag }).applied, true);
		assert.equal(controller.apply("create:deploying", { itemPort: largeCogs, matchesTag }).applied, true);
		const finalStep = controller.apply("create:deploying", { itemPort: nuggets, matchesTag, roll: 0 });
		assert.equal(finalStep.applied, true);
		assert.equal(finalStep.complete, index === 4);
	}
	assert.equal(cogs.inspect().slots[0], undefined);
	assert.equal(largeCogs.inspect().slots[0], undefined);
	assert.equal(nuggets.inspect().slots[0], undefined);
	assert.deepEqual(controller.outputPort.inspect().slots, [{ count: 1, typeId: "createbedrock:precision_mechanism" }, undefined, undefined, undefined]);
	assert.equal(controller.inspect().machine.phase, "idle");
});

test("sequenced-assembly controller persists partial progress and charges the exact Java fluid amount", () => {
	const controller = new SequencedAssemblyController(recipes, { id: "test:sturdy" });
	const input = new ItemPort({ id: "test:sturdy-input", size: 1, slots: [{ count: 1, typeId: "createbedrock:powdered_obsidian" }] });
	const lava = new FluidTank({ capacity: 1_000, contents: { amount: 500, typeId: "minecraft:lava" }, id: "test:lava" });
	assert.equal(controller.start("create:sequenced_assembly/sturdy_sheet", input, { matchesTag }).accepted, true);
	assert.equal(controller.apply("create:filling", { fluidPort: lava, matchesTag }).applied, true);
	assert.equal(lava.inspect().contents, undefined);
	const restored = new SequencedAssemblyController(recipes, { id: "test:sturdy" });
	restored.restore(controller.snapshot());
	assert.equal(restored.apply("create:pressing", { matchesTag }).applied, true);
	assert.equal(restored.apply("create:pressing", { matchesTag }).complete, true);
	assert.deepEqual(restored.outputPort.inspect().slots[0], { count: 1, typeId: "createbedrock:sturdy_sheet" });
});

test("sequenced-assembly controller leaves the sequence unchanged when a required station resource is absent", () => {
	const controller = new SequencedAssemblyController(recipes, { id: "test:missing" });
	const input = new ItemPort({ id: "test:missing-input", size: 1, slots: [{ count: 1, typeId: "createbedrock:golden_sheet" }] });
	assert.equal(controller.start("create:sequenced_assembly/precision_mechanism", input, { matchesTag }).accepted, true);
	assert.deepEqual(controller.apply("create:deploying", { matchesTag }), { applied: false, reason: "missing_item_port" });
	assert.deepEqual(controller.inspect().machine, {
		completedLoops: 0,
		phase: "processing",
		recipeId: "create:sequenced_assembly/precision_mechanism",
		stepIndex: 0
	});
});

test("sequenced-assembly controller accepts every Java sleeper and either rail nugget before pressing a track", () => {
	const controller = new SequencedAssemblyController(recipes, { id: "test:track" });
	const sleepers = new ItemPort({ id: "test:sleepers", size: 1, slots: [{ count: 1, typeId: "minecraft:smooth_stone_slab" }] });
	const zincNuggets = new ItemPort({ id: "test:zinc-nuggets", size: 1, slots: [{ count: 2, typeId: "createbedrock:zinc_nugget" }] });
	assert.equal(controller.start("create:sequenced_assembly/track", sleepers, { matchesTag }).accepted, true);
	assert.equal(controller.apply("create:deploying", { itemPort: zincNuggets, matchesTag }).applied, true);
	assert.equal(controller.apply("create:deploying", { itemPort: zincNuggets, matchesTag }).applied, true);
	assert.equal(controller.apply("create:pressing", { matchesTag }).complete, true);
	assert.deepEqual(controller.outputPort.inspect().slots[0], { count: 1, typeId: "createbedrock:track" });
});
