import assert from "node:assert/strict";
import test from "node:test";

import { DepotNetwork } from "../behavior_pack/scripts/logistics/depot-network.js";
import { SequencedAssemblyBeltCarrier } from "../behavior_pack/scripts/processing/sequenced-assembly-belt-carrier.js";

function memoryStorage() {
	const values = new Map();
	return { delete: key => values.delete(key), get: key => values.get(key), set: (key, value) => values.set(key, value) };
}

function advance(network, predicate, maximumTicks = 150) {
	for (let tick = 0; tick < maximumTicks; tick++) {
		network.tick();
		if (predicate())
			return;
	}
	throw new Error("Depot network did not reach the expected state");
}

const RECIPES = [{
	id: "create:sequenced_assembly/test",
	input: { count: 1, kind: "item", typeId: "minecraft:iron_ingot" },
	loops: 1,
	outputs: [{ chance: 1, count: 1, typeId: "createbedrock:finished_test" }],
	steps: [{ ingredients: [{ count: 1, kind: "item", typeId: "createbedrock:incomplete_test" }], outputs: [], type: "press" }],
	transitionalItem: "createbedrock:incomplete_test"
}];

function createNetwork(storage) {
	return new DepotNetwork({ keyPrefix: "createbedrock:sequenced_belt_test", retryIntervalTicks: 1, storage, writesPerTick: 1 });
}

test("sequenced Belt carrier owns its session and item in one persisted transport record", () => {
	const storage = memoryStorage();
	const network = createNetwork(storage);
	const source = network.createDepot({ dimensionId: "minecraft:overworld", location: { x: 0, y: 64, z: 0 } });
	const destination = network.createDepot({ dimensionId: "minecraft:overworld", location: { x: 8, y: 64, z: 0 } });
	network.insert(source, { count: 1, typeId: "minecraft:iron_ingot" });
	network.createBelt({ destinationId: destination, id: "belt:sequence", length: 8, sourceId: source, speed: 64 });
	advance(network, () => network.beltTransports().length === 1 && !network.diagnostics().waitingForCommit);
	const [transport] = network.beltTransports();
	const bridge = new SequencedAssemblyBeltCarrier({ network, recipes: RECIPES });
	assert.equal(bridge.begin({ recipeId: RECIPES[0].id, transportId: transport.id }).accepted, true);
	assert.equal(network.beltCarrier(transport.id).item.typeId, "createbedrock:incomplete_test");
	advance(network, () => !network.diagnostics().waitingForCommit);

	const recovered = createNetwork(storage);
	assert.equal(recovered.restore().transports, 1);
	const resumed = new SequencedAssemblyBeltCarrier({ network: recovered, recipes: RECIPES });
	assert.equal(resumed.apply({ stationType: "press", transportId: transport.id }).applied, true);
	assert.equal(resumed.release({ transportId: transport.id }).released, true);
	assert.equal(recovered.beltCarrier(transport.id).item.typeId, "createbedrock:finished_test");
	advance(recovered, () => !recovered.beltCarrier(transport.id));
	assert.equal(recovered.snapshot().find(record => record.kind === "depot" && record.port.id === destination).port.slots[0].typeId, "createbedrock:finished_test");
});

test("sequenced Belt carrier rejects a stack instead of silently losing trailing items", () => {
	const network = createNetwork(memoryStorage());
	const source = network.createDepot({ dimensionId: "minecraft:overworld", location: { x: 0, y: 64, z: 0 } });
	const destination = network.createDepot({ dimensionId: "minecraft:overworld", location: { x: 8, y: 64, z: 0 } });
	network.insert(source, { count: 2, typeId: "minecraft:iron_ingot" });
	network.createBelt({ destinationId: destination, id: "belt:stack", length: 8, sourceId: source, speed: 64 });
	advance(network, () => network.beltTransports().length === 1 && !network.diagnostics().waitingForCommit);
	const bridge = new SequencedAssemblyBeltCarrier({ network, recipes: RECIPES });
	assert.deepEqual(bridge.begin({ recipeId: RECIPES[0].id, transportId: network.beltTransports()[0].id }), { accepted: false, reason: "stacked_carrier" });
});
