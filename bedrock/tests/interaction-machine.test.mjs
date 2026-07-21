import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { InteractionMachine } from "../behavior_pack/scripts/processing/interaction-machine.js";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const bedrockRoot = resolve(testDirectory, "..");
const recipes = await readFile(resolve(bedrockRoot, "data", "recipes", "interactions.json"), "utf8").then(JSON.parse).then(document => document.recipes);

test("interaction machine retains Deployer tools while consuming a Java item-application input", () => {
	const machine = new InteractionMachine(recipes);
	const plan = machine.plan("create:deploying/chiseled_copper_from_removing_wax", {
		heldItem: { count: 1, typeId: "minecraft:diamond_axe" },
		input: { count: 1, typeId: "minecraft:waxed_chiseled_copper" },
		matchesTag: (tag, item) => tag === "minecraft:axes" && item === "minecraft:diamond_axe"
	});
	assert.deepEqual(plan, {
		accepted: true,
		consumed: { fluids: [], items: [{ count: 1, typeId: "minecraft:waxed_chiseled_copper" }] },
		keepHeldItem: true,
		outputs: { fluids: [], items: [{ count: 1, typeId: "minecraft:chiseled_copper" }] },
		recipeId: "create:deploying/chiseled_copper_from_removing_wax"
	});
});

test("interaction machine preserves emptying fluid amounts and rejects an incorrect held item", () => {
	const machine = new InteractionMachine(recipes);
	const tea = machine.plan("create:emptying/builders_tea", { input: { count: 1, typeId: "createbedrock:builders_tea" } });
	assert.deepEqual(tea.outputs, {
		fluids: [{ amount: 250, typeId: "createbedrock:tea" }],
		items: [{ count: 1, typeId: "minecraft:glass_bottle" }]
	});
	assert.deepEqual(machine.plan("create:item_application/railway_casing", {
		heldItem: { count: 1, typeId: "minecraft:iron_ingot" },
		input: { count: 1, typeId: "createbedrock:brass_casing" },
		matchesTag: () => false
	}), { accepted: false, reason: "wrong_held_item" });
});
