import assert from "node:assert/strict";
import test from "node:test";

import { fluidTankId, FluidNetworkState } from "../behavior_pack/scripts/fluids/fluid-network-state.js";

function memoryStorage() {
	const values = new Map();
	return {
		delete(key) {
			values.delete(key);
		},
		get(key) {
			return values.get(key);
		},
		set(key, value) {
			values.set(key, value);
		},
		keys() {
			return [...values.keys()];
		}
	};
}

function advance(state, predicate, maximumTicks = 200) {
	for (let tick = 0; tick < maximumTicks; tick++) {
		state.tick();
		if (predicate())
			return;
	}
	throw new Error("Fluid state did not reach the expected state");
}

function createState(storage, keyPrefix = "createbedrock:fluid_state_test") {
	return new FluidNetworkState({ keyPrefix, storage, transfersPerTick: 1, writesPerTick: 1 });
}

function fill(state, id) {
	return state.snapshot().find(record => record.kind === "tank" && record.tank.id === id)?.tank.contents;
}

test("FluidNetworkState persists sectioned tanks and links without creating fluid", () => {
	const state = createState(memoryStorage());
	const source = state.createTank({ dimensionId: "minecraft:overworld", location: { x: 0, y: 64, z: 0 } });
	const destination = state.createTank({ dimensionId: "minecraft:overworld", location: { x: 32, y: 64, z: 0 } });
	state.insert(source, { amount: 500, typeId: "minecraft:water" });
	state.createPipe({ destinationId: destination, id: "pipe:state", maxAmountPerTick: 250, sourceId: source });
	advance(state, () => fill(state, source) === undefined && fill(state, destination)?.amount === 500 && !state.diagnostics().waitingForCommit);
	assert.deepEqual(fill(state, destination), { amount: 500, typeId: "minecraft:water" });
	assert.equal(state.snapshot().filter(record => record.kind === "link")[0].partition, "minecraft:overworld:0:4:0");
	assert.equal(state.canRemoveTank(destination), false);
});

test("FluidNetworkState resumes a persisted partial escrow after restart", () => {
	const storage = memoryStorage();
	const first = createState(storage, "createbedrock:fluid_state_restart");
	const source = first.createTank({ dimensionId: "minecraft:overworld", location: { x: 0, y: 64, z: 0 } });
	const destination = first.createTank({ capacity: 200, dimensionId: "minecraft:overworld", location: { x: 1, y: 64, z: 0 } });
	first.insert(source, { amount: 500, typeId: "minecraft:water" });
	first.insert(destination, { amount: 200, typeId: "minecraft:water" });
	first.createPump({ destinationId: destination, id: "pump:restart", maxAmountPerTick: 300, sourceId: source });
	advance(first, () => first.diagnostics().activeTransfers === 1 && !first.diagnostics().waitingForCommit);
	assert.deepEqual(fill(first, source), { amount: 200, typeId: "minecraft:water" });

	const restored = createState(storage, "createbedrock:fluid_state_restart");
	assert.deepEqual(restored.restore(), { frozen: false, links: 1, tanks: 2, transfers: 1, warnings: [] });
	assert.deepEqual(restored.extract(destination), { amount: 200, typeId: "minecraft:water" });
	advance(restored, () => fill(restored, destination)?.amount === 200 && restored.diagnostics().activeTransfers === 1 && !restored.diagnostics().waitingForCommit);
	restored.setPumpRunning("pump:restart", false);
	assert.deepEqual(restored.extract(destination), { amount: 200, typeId: "minecraft:water" });
	advance(restored, () => fill(restored, destination)?.amount === 100 && restored.diagnostics().activeTransfers === 0 && !restored.diagnostics().waitingForCommit);
	assert.deepEqual(fill(restored, source), { amount: 200, typeId: "minecraft:water" });
	assert.deepEqual(fill(restored, destination), { amount: 100, typeId: "minecraft:water" });
});

test("FluidNetworkState freezes instead of overwriting a corrupt persisted shard", () => {
	const storage = memoryStorage();
	const writer = createState(storage, "createbedrock:fluid_state_invalid");
	const id = writer.createTank({ dimensionId: "minecraft:overworld", location: { x: 0, y: 64, z: 0 } });
	advance(writer, () => !writer.diagnostics().waitingForCommit);
	const shardKey = storage.keys().find(key => key.includes("_s"));
	assert.ok(shardKey);
	storage.set(shardKey, "not JSON");

	const errors = [];
	const state = new FluidNetworkState({
		keyPrefix: "createbedrock:fluid_state_invalid",
		onError(error) {
			errors.push(String(error));
		},
		storage
	});
	const result = state.restore();
	assert.equal(result.frozen, true);
	assert.equal(result.warnings.length, 1);
	assert.throws(() => state.createTank({ dimensionId: "minecraft:overworld", location: { x: 1, y: 64, z: 0 } }), /frozen/);
	assert.equal(state.diagnostics().tanks, 0);
	assert.ok(errors.length > 0);
	assert.equal(id, fluidTankId("minecraft:overworld", { x: 0, y: 64, z: 0 }));
});
