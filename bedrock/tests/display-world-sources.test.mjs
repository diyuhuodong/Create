import assert from "node:assert/strict";
import test from "node:test";

import { DISPLAY_SOURCE_KINDS, displaySourceProviderKinds, resolveDisplaySource } from "../behavior_pack/scripts/redstone/display-source.js";
import { registerWorldDisplaySourceProviders } from "../behavior_pack/scripts/redstone/display-world-sources.js";

test("all Java Display Source kinds have bounded Bedrock world adapters", () => {
	const block = {
		getComponent() { return undefined; },
		permutation: { getAllStates() { return { "createbedrock:signal": 7 }; } },
		typeId: "minecraft:stone"
	};
	const world = {
		getAbsoluteTime() { return 400; },
		getDimension() { return { getBlock() { return block; }, getEntities() { return []; } }; },
		getTimeOfDay() { return 6000; },
		scoreboard: { getObjective() { return undefined; } }
	};
	registerWorldDisplaySourceProviders({
		getBoiler() { return { engineCount: 2, heatLevel: 4, waterSupply: 40 }; },
		getFluid() { return { amount: 500, capacity: 1000, typeId: "minecraft:water" }; },
		getPackage() { return { address: "Brass" }; },
		getTrain() { return { trains: [] }; },
		kineticNetwork() { return { stressCapacity: 64, stressImpact: 16 }; },
		kineticSpeed() { return 32; },
		readNixie() { return ["12"]; },
		world
	});
	assert.deepEqual(displaySourceProviderKinds(), [...DISPLAY_SOURCE_KINDS].sort());
	const context = { record: { configuration: { settings: { computerText: "A|B", scoreboardObjective: "create" } }, dimensionId: "minecraft:overworld" } };
	for (const kind of DISPLAY_SOURCE_KINDS) {
		const lines = resolveDisplaySource({ context, kind, location: { x: 0, y: 0, z: 0 } });
		assert.ok(Array.isArray(lines) && lines.length > 0, `${kind} must return at least one line`);
	}
});
