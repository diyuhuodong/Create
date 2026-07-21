import assert from "node:assert/strict";
import test from "node:test";

import { BasinProcessingMachine } from "../behavior_pack/scripts/processing/basin-processing-machine.js";
import { BURNER_HEAT_LEVEL } from "../behavior_pack/scripts/fluids/heat-level.js";
import { FluidTank } from "../behavior_pack/scripts/fluids/fluid-tank.js";

const recipes = [
	{
		fluidIngredients: [{ amount: 250, tag: "c:milk" }],
		fluidOutputs: [{ amount: 500, typeId: "createbedrock:chocolate" }],
		heatRequirement: "heated",
		id: "create:basin/chocolate",
		ingredients: [],
		mode: "mixing",
		outputs: [],
		processingTicks: 1
	},
	{
		fluidIngredients: [],
		fluidOutputs: [],
		heatRequirement: "superheated",
		id: "create:basin/brass",
		ingredients: [{ count: 1, typeId: "minecraft:copper_ingot" }],
		mode: "mixing",
		outputs: [{ chance: 1, count: 1, typeId: "createbedrock:brass_ingot" }],
		processingTicks: 1
	}
];

test("BasinProcessingMachine applies Create heat thresholds before consuming items or fluid", () => {
	const basin = new BasinProcessingMachine(recipes, { id: "basin:heat" });
	const tank = new FluidTank({ capacity: 1_000, id: "basin:heat:fluid" });
	basin.insertInput({ count: 1, typeId: "minecraft:copper_ingot" });
	assert.equal(basin.tick({ fluidPort: tank, heatLevel: BURNER_HEAT_LEVEL.KINDLED, mode: "mixing", powered: true }), undefined);
	assert.deepEqual(basin.peekInput(), { count: 1, typeId: "minecraft:copper_ingot" });
	assert.equal(basin.tick({ fluidPort: tank, heatLevel: BURNER_HEAT_LEVEL.SEETHING, mode: "mixing", powered: true }).started, true);
	assert.equal(basin.tick({ fluidPort: tank, heatLevel: BURNER_HEAT_LEVEL.KINDLED, mode: "mixing", powered: true }).paused, true);
	assert.equal(basin.tick({ fluidPort: tank, heatLevel: BURNER_HEAT_LEVEL.SEETHING, mode: "mixing", powered: true }).completed, true);
	assert.equal(basin.tick({ fluidPort: tank }).delivered.count, 1);
	assert.deepEqual(basin.extractOutput(), { count: 1, typeId: "createbedrock:brass_ingot" });
});

test("BasinProcessingMachine keeps fluid output escrow across blockage and restart", () => {
	const tank = new FluidTank({ capacity: 1_000, contents: { amount: 1_000, typeId: "createbedrock:milk" }, id: "basin:fluid" });
	const basin = new BasinProcessingMachine(recipes, { id: "basin:restart" });
	assert.equal(basin.tick({ fluidPort: tank, heatLevel: BURNER_HEAT_LEVEL.KINDLED, mode: "mixing", powered: true }).started, true);
	assert.equal(basin.tick({ fluidPort: tank, heatLevel: BURNER_HEAT_LEVEL.KINDLED, mode: "mixing", powered: true }).pendingFluidOutput, true);
	assert.deepEqual(tank.inspect().contents, { amount: 750, typeId: "createbedrock:milk" });

	const restartedTank = new FluidTank({ capacity: 1_000, id: "basin:fluid" });
	restartedTank.restore(tank.snapshot());
	const restarted = new BasinProcessingMachine(recipes, { id: "basin:restart" });
	restarted.restore(basin.snapshot());
	restartedTank.extract(restartedTank.reserve());
	assert.deepEqual(restarted.tick({ fluidPort: restartedTank }), { completed: true, pendingOutput: false, recipeId: "create:basin/chocolate" });
	assert.deepEqual(restartedTank.inspect().contents, { amount: 500, typeId: "createbedrock:chocolate" });
});
