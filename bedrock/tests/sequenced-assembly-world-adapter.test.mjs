import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { FluidTank } from "../behavior_pack/scripts/fluids/fluid-tank.js";
import { ItemPort } from "../behavior_pack/scripts/logistics/item-port.js";
import { SequencedAssemblyWorldAdapter } from "../behavior_pack/scripts/processing/sequenced-assembly-world-adapter.js";
import { matchesSequencedAssemblyTag } from "../behavior_pack/scripts/processing/sequenced-assembly-tags.js";

const bedrockRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const recipes = await readFile(resolve(bedrockRoot, "data/recipes/sequenced-assembly.json"), "utf8").then(JSON.parse).then(document => document.recipes);

test("sequenced-assembly world adapter persists one carrier across a Spout and two Press actions", () => {
	const adapter = new SequencedAssemblyWorldAdapter(recipes, { matchesTag: matchesSequencedAssemblyTag });
	const input = new ItemPort({ id: "test:input", size: 1, slots: [{ count: 1, typeId: "createbedrock:powdered_obsidian" }] });
	const lava = new FluidTank({ capacity: 1_000, contents: { amount: 500, typeId: "minecraft:lava" }, id: "test:lava" });
	assert.equal(adapter.begin({ carrierId: "minecraft:overworld:carrier-1", inputPort: input, recipeId: "create:sequenced_assembly/sturdy_sheet" }).accepted, true);
	assert.equal(adapter.apply({ carrierId: "minecraft:overworld:carrier-1", fluidPort: lava, stationType: "create:filling" }).applied, true);
	const resumed = new SequencedAssemblyWorldAdapter(recipes, { matchesTag: matchesSequencedAssemblyTag });
	resumed.restore(adapter.snapshot());
	assert.equal(resumed.apply({ carrierId: "minecraft:overworld:carrier-1", stationType: "create:pressing" }).applied, true);
	assert.equal(resumed.apply({ carrierId: "minecraft:overworld:carrier-1", stationType: "create:pressing" }).complete, true);
	const output = new ItemPort({ id: "test:output", size: 1 });
	assert.deepEqual(resumed.collect({ carrierId: "minecraft:overworld:carrier-1", outputPort: output }), {
		collected: true,
		output: { count: 1, typeId: "createbedrock:sturdy_sheet" }
	});
	assert.deepEqual(output.inspect().slots, [{ count: 1, typeId: "createbedrock:sturdy_sheet" }]);
	assert.equal(resumed.inspect("minecraft:overworld:carrier-1"), undefined);
});

test("sequenced-assembly world adapter keeps carrier ownership isolated and rejects duplicate starts", () => {
	const adapter = new SequencedAssemblyWorldAdapter(recipes, { matchesTag: matchesSequencedAssemblyTag });
	const input = new ItemPort({ id: "test:gold", size: 1, slots: [{ count: 2, typeId: "createbedrock:golden_sheet" }] });
	assert.equal(adapter.begin({ carrierId: "minecraft:overworld:carrier-a", inputPort: input, recipeId: "create:sequenced_assembly/precision_mechanism" }).accepted, true);
	assert.deepEqual(adapter.begin({ carrierId: "minecraft:overworld:carrier-a", inputPort: input, recipeId: "create:sequenced_assembly/precision_mechanism" }), { accepted: false, reason: "carrier_busy" });
	assert.deepEqual(adapter.apply({ carrierId: "minecraft:overworld:missing", stationType: "create:deploying" }), { applied: false, reason: "unknown_carrier" });
	assert.equal(adapter.apply({ carrierId: "minecraft:overworld:carrier-a", stationType: "create:pressing" }).reason, "wrong_step_type");
});
