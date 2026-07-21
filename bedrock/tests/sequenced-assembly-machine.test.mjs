import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { SequencedAssemblyMachine } from "../behavior_pack/scripts/processing/sequenced-assembly-machine.js";
import { matchesSequencedAssemblyTag } from "../behavior_pack/scripts/processing/sequenced-assembly-tags.js";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(testDirectory, "..");
const recipes = await readFile(resolve(bedrockRoot, "data", "recipes", "sequenced-assembly.json"), "utf8").then(JSON.parse).then(document => document.recipes);

const matchesTag = matchesSequencedAssemblyTag;

test("precision mechanism performs every deployment across all five Java loops before its weighted result", () => {
	const machine = new SequencedAssemblyMachine(recipes);
	assert.equal(machine.begin("create:sequenced_assembly/precision_mechanism", { count: 1, typeId: "createbedrock:golden_sheet" }, { matchesTag }).accepted, true);
	for (let loop = 0; loop < 5; loop++) {
		assert.equal(machine.apply("create:deploying", { items: [{ count: 1, typeId: "createbedrock:cogwheel" }], matchesTag }).applied, true);
		assert.equal(machine.apply("create:deploying", { items: [{ count: 1, typeId: "createbedrock:large_cogwheel" }], matchesTag }).applied, true);
		const result = machine.apply("create:deploying", { items: [{ count: 1, typeId: "minecraft:iron_nugget" }], matchesTag, roll: 0 });
		assert.equal(result.applied, true);
		assert.equal(result.complete, loop === 4);
	}
	assert.deepEqual(machine.takeOutput(), { count: 1, typeId: "createbedrock:precision_mechanism" });
	assert.deepEqual(machine.snapshot(), { phase: "idle" });
});

test("sequenced assembly rejects wrong steps, persists a partial loop, and preserves sturdy-sheet fluid requirements", () => {
	const machine = new SequencedAssemblyMachine(recipes);
	assert.deepEqual(machine.begin("create:sequenced_assembly/precision_mechanism", { count: 1, typeId: "minecraft:gold_ingot" }, { matchesTag }), { accepted: false, reason: "wrong_input" });
	assert.equal(machine.begin("create:sequenced_assembly/precision_mechanism", { count: 1, typeId: "createbedrock:golden_sheet" }, { matchesTag }).accepted, true);
	assert.deepEqual(machine.apply("create:pressing", { items: [{ count: 1, typeId: "createbedrock:cogwheel" }], matchesTag }), { applied: false, reason: "wrong_step_type" });
	assert.equal(machine.apply("create:deploying", { items: [{ count: 1, typeId: "createbedrock:cogwheel" }], matchesTag }).applied, true);
	const restored = new SequencedAssemblyMachine(recipes);
	restored.restore(machine.snapshot());
	assert.equal(restored.apply("create:deploying", { items: [{ count: 1, typeId: "createbedrock:large_cogwheel" }], matchesTag }).applied, true);

	const sturdy = new SequencedAssemblyMachine(recipes);
	assert.equal(sturdy.begin("create:sequenced_assembly/sturdy_sheet", { count: 1, typeId: "createbedrock:powdered_obsidian" }, { matchesTag }).accepted, true);
	assert.deepEqual(sturdy.apply("create:filling", { fluids: [{ amount: 499, typeId: "minecraft:lava" }], matchesTag }), { applied: false, reason: "wrong_fluid" });
	assert.equal(sturdy.apply("create:filling", { fluids: [{ amount: 500, typeId: "minecraft:lava" }], matchesTag }).applied, true);
	assert.equal(sturdy.apply("create:pressing", { matchesTag }).applied, true);
	assert.equal(sturdy.apply("create:pressing", { matchesTag }).complete, true);
	assert.deepEqual(sturdy.takeOutput(), { count: 1, typeId: "createbedrock:sturdy_sheet" });
});
