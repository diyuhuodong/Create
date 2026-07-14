import assert from "node:assert/strict";
import test from "node:test";

import { fluidTankId, FluidNetworkState } from "../behavior_pack/scripts/fluids/fluid-network-state.js";
import { FluidPort } from "../behavior_pack/scripts/fluids/fluid-port.js";
import { FluidTank } from "../behavior_pack/scripts/fluids/fluid-tank.js";
import { VanillaWorldFluidPort } from "../behavior_pack/scripts/fluids/world-fluid-port.js";

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

function createState(storage, keyPrefix = "createbedrock:fluid_state_test", options = {}) {
	return new FluidNetworkState({ keyPrefix, storage, transfersPerTick: 1, writesPerTick: 1, ...options });
}

function fill(state, id) {
	return state.snapshot().find(record => record.kind === "tank" && record.tank.id === id)?.tank.contents;
}

function durableExternalPort({ contents, id }) {
	const finalized = [];
	const tank = new FluidTank({ capacity: 1_000, contents, id });
	return {
		finalized,
		port: {
			finalizeReservation(reservation) {
				finalized.push(reservation.escrowId);
				return true;
			},
			extract(reservation, options) {
				return tank.extract(reservation, options);
			},
			get id() {
				return tank.id;
			},
			insert(fluid, options) {
				return tank.insert(fluid, options);
			},
			reserve(options) {
				const reservation = tank.reserve(options);
				return reservation && { ...reservation, escrowId: `escrow:${options.transactionId}`, transactionId: options.transactionId };
			}
		},
		tank
	};
}

function worldCell(block) {
	let current = JSON.parse(JSON.stringify(block));
	return {
		read() {
			return JSON.parse(JSON.stringify(current));
		},
		write(next) {
			current = JSON.parse(JSON.stringify(next));
		}
	};
}

function worldEscrows() {
	const records = new Map();
	return {
		adapter: {
			create({ transactionId }) {
				const id = `escrow:${transactionId}`;
				records.set(id, undefined);
				return { id };
			},
			resolve({ escrowId }) {
				if (!records.has(escrowId))
					return undefined;
				return {
					clear() {
						records.set(escrowId, undefined);
					},
					read() {
						const fluid = records.get(escrowId);
						return fluid && { ...fluid };
					},
					retire() {
						records.delete(escrowId);
					},
					write(fluid) {
						records.set(escrowId, { ...fluid });
					}
				};
			}
		},
		records
	};
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

test("FluidNetworkState commits a durable intent before extracting its source tank", () => {
	const storage = memoryStorage();
	const state = createState(storage, "createbedrock:fluid_state_intent");
	const source = state.createTank({ dimensionId: "minecraft:overworld", location: { x: 0, y: 64, z: 0 } });
	const destination = state.createTank({ dimensionId: "minecraft:overworld", location: { x: 1, y: 64, z: 0 } });
	state.insert(source, { amount: 500, typeId: "minecraft:water" });
	state.createPipe({ destinationId: destination, id: "pipe:intent", maxAmountPerTick: 250, sourceId: source });
	advance(state, () => state.snapshot().find(record => record.kind === "transfer")?.transfer.state === "intent" && state.diagnostics().waitingForCommit);
	assert.deepEqual(fill(state, source), { amount: 500, typeId: "minecraft:water" });
	assert.deepEqual(state.snapshot().find(record => record.kind === "transfer")?.transfer.state, "intent");

	advance(state, () => !state.diagnostics().waitingForCommit);
	assert.deepEqual(fill(state, source), { amount: 500, typeId: "minecraft:water" });
	const restored = createState(storage, "createbedrock:fluid_state_intent");
	assert.deepEqual(restored.restore(), { frozen: false, links: 1, tanks: 2, transfers: 1, warnings: [] });
	assert.deepEqual(fill(restored, source), { amount: 500, typeId: "minecraft:water" });
	state.tick();
	assert.deepEqual(fill(state, source), { amount: 250, typeId: "minecraft:water" });
	assert.equal(state.snapshot().find(record => record.kind === "transfer")?.transfer.state, "escrowed");
});

test("FluidNetworkState resumes a persisted partial escrow after restart", () => {
	const storage = memoryStorage();
	const first = createState(storage, "createbedrock:fluid_state_restart");
	const source = first.createTank({ dimensionId: "minecraft:overworld", location: { x: 0, y: 64, z: 0 } });
	const destination = first.createTank({ capacity: 200, dimensionId: "minecraft:overworld", location: { x: 1, y: 64, z: 0 } });
	first.insert(source, { amount: 500, typeId: "minecraft:water" });
	first.insert(destination, { amount: 200, typeId: "minecraft:water" });
	first.createPump({ destinationId: destination, id: "pump:restart", maxAmountPerTick: 300, sourceId: source });
	advance(first, () => first.snapshot().find(record => record.kind === "transfer")?.transfer.state === "escrowed" && !first.diagnostics().waitingForCommit);
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

test("FluidNetworkState restores a persistent external port before its linked transfers resume", () => {
	const storage = memoryStorage();
	const externalTank = new FluidTank({
		contents: { amount: 500, typeId: "minecraft:water" },
		capacity: 1_000,
		id: "world:source"
	});
	const externalPort = new FluidPort({ tank: externalTank });
	const externalPortFactory = ({ descriptor, id }) => {
		assert.deepEqual(descriptor, { kind: "test_world_source", location: { x: -1, y: 64, z: 0 } });
		assert.equal(id, externalPort.id);
		return externalPort;
	};
	const first = createState(storage, "createbedrock:fluid_state_external", { externalPortFactory });
	const destination = first.createTank({ dimensionId: "minecraft:overworld", location: { x: 0, y: 64, z: 0 } });
	first.registerExternalPort({
		descriptor: { kind: "test_world_source", location: { x: -1, y: 64, z: 0 } },
		partition: "minecraft:overworld:-1:4:0",
		port: externalPort
	});
	first.createPump({ destinationId: destination, id: "pump:external", maxAmountPerTick: 250, sourceId: externalPort.id });
	advance(first, () => first.snapshot().find(record => record.kind === "transfer")?.transfer.state === "intent" && !first.diagnostics().waitingForCommit);
	assert.equal(first.diagnostics().externalPorts, 1);
	assert.deepEqual(first.snapshot().find(record => record.kind === "external_port"), {
		descriptor: { kind: "test_world_source", location: { x: -1, y: 64, z: 0 } },
		id: "world:source",
		kind: "external_port",
		partition: "minecraft:overworld:-1:4:0"
	});

	const restored = createState(storage, "createbedrock:fluid_state_external", { externalPortFactory });
	assert.deepEqual(restored.restore(), { frozen: false, links: 1, tanks: 1, transfers: 1, warnings: [] });
	advance(restored, () => fill(restored, destination)?.amount === 500 && !restored.diagnostics().waitingForCommit);
	assert.deepEqual(externalTank.inspect().contents, undefined);
	assert.deepEqual(fill(restored, destination), { amount: 500, typeId: "minecraft:water" });
});

test("FluidNetworkState freezes when a persisted external port cannot be reconstructed", () => {
	const storage = memoryStorage();
	const externalPort = new FluidPort({ tank: new FluidTank({ capacity: 1_000, id: "world:missing" }) });
	const writer = createState(storage, "createbedrock:fluid_state_external_missing");
	writer.registerExternalPort({
		descriptor: { kind: "test_world_source" },
		partition: "minecraft:overworld:0:4:0",
		port: externalPort
	});
	advance(writer, () => !writer.diagnostics().waitingForCommit);

	const restored = createState(storage, "createbedrock:fluid_state_external_missing");
	const result = restored.restore();
	assert.equal(result.frozen, true);
	assert.match(result.warnings[0].error, /external port/);
});

test("FluidNetworkState retires a world-style source escrow only after its target commit", () => {
	const storage = memoryStorage();
	const source = durableExternalPort({
		contents: { amount: 500, typeId: "minecraft:water" },
		id: "world:retirement"
	});
	const externalPortFactory = ({ id }) => {
		assert.equal(id, source.port.id);
		return source.port;
	};
	const state = createState(storage, "createbedrock:fluid_state_retirement", { externalPortFactory });
	const destination = state.createTank({ dimensionId: "minecraft:overworld", location: { x: 0, y: 64, z: 0 } });
	state.registerExternalPort({
		descriptor: { kind: "test_world_source" },
		partition: "minecraft:overworld:0:4:0",
		port: source.port
	});
	state.createPump({ destinationId: destination, id: "pump:retirement", maxAmountPerTick: 500, sourceId: source.port.id });
	advance(state, () => state.diagnostics().retiringExternalEscrows === 1 && state.diagnostics().waitingForCommit);
	assert.deepEqual(fill(state, destination), { amount: 500, typeId: "minecraft:water" });
	assert.deepEqual(source.finalized, []);
	advance(state, () => source.finalized.length === 1 && state.diagnostics().retiringExternalEscrows === 0 && !state.diagnostics().waitingForCommit);
	assert.deepEqual(source.finalized, ["escrow:fluid-link:pump:retirement:0"]);
	assert.deepEqual(source.tank.inspect().contents, undefined);
});

test("FluidNetworkState resumes a world source from physical escrow without duplicating fluid", () => {
	const storage = memoryStorage();
	const cell = worldCell({ states: { liquid_depth: 0 }, typeId: "minecraft:water" });
	const escrows = worldEscrows();
	const descriptor = { kind: "test_world_source" };
	const createPort = () => new VanillaWorldFluidPort({
		escrows: escrows.adapter,
		id: "world:source:restart",
		readBlock() {
			return cell.read();
		},
		writeBlock(block) {
			cell.write(block);
		}
	});
	const factory = ({ id }) => {
		assert.equal(id, "world:source:restart");
		return createPort();
	};
	const first = createState(storage, "createbedrock:fluid_state_world_restart", { externalPortFactory: factory });
	const destination = first.createTank({ dimensionId: "minecraft:overworld", location: { x: 0, y: 64, z: 0 } });
	first.registerExternalPort({ descriptor, partition: "minecraft:overworld:-1:4:0", port: createPort() });
	first.createPump({ destinationId: destination, id: "pump:world-restart", maxAmountPerTick: 1_000, sourceId: "world:source:restart" });
	advance(first, () => first.snapshot().find(record => record.kind === "transfer")?.transfer.state === "escrowed" && !first.diagnostics().waitingForCommit);
	assert.deepEqual(cell.read(), { states: {}, typeId: "minecraft:air" });
	assert.equal(escrows.records.size, 1);

	const restored = createState(storage, "createbedrock:fluid_state_world_restart", { externalPortFactory: factory });
	assert.deepEqual(restored.restore(), { frozen: false, links: 1, tanks: 1, transfers: 1, warnings: [] });
	advance(restored, () => fill(restored, destination)?.amount === 1_000 && restored.diagnostics().retiringExternalEscrows === 0 && !restored.diagnostics().waitingForCommit);
	assert.deepEqual(fill(restored, destination), { amount: 1_000, typeId: "minecraft:water" });
	assert.deepEqual(cell.read(), { states: {}, typeId: "minecraft:air" });
	assert.equal(escrows.records.size, 0);
});

test("FluidNetworkState freezes a world-source transaction after conflicting external mutation", () => {
	const storage = memoryStorage();
	const cell = worldCell({ states: { liquid_depth: 0 }, typeId: "minecraft:water" });
	const escrows = worldEscrows();
	const createPort = () => new VanillaWorldFluidPort({
		escrows: escrows.adapter,
		id: "world:source:conflict",
		readBlock() {
			return cell.read();
		},
		writeBlock(block) {
			cell.write(block);
		}
	});
	const state = createState(storage, "createbedrock:fluid_state_world_conflict", {
		externalPortFactory() {
			return createPort();
		}
	});
	const destination = state.createTank({ dimensionId: "minecraft:overworld", location: { x: 0, y: 64, z: 0 } });
	state.registerExternalPort({
		descriptor: { kind: "test_world_source" },
		partition: "minecraft:overworld:-1:4:0",
		port: createPort()
	});
	state.createPump({ destinationId: destination, id: "pump:world-conflict", maxAmountPerTick: 1_000, sourceId: "world:source:conflict" });
	advance(state, () => state.snapshot().find(record => record.kind === "transfer")?.transfer.state === "intent" && !state.diagnostics().waitingForCommit);
	cell.write({ states: {}, typeId: "minecraft:stone" });
	state.tick();
	assert.equal(state.diagnostics().frozen, true);
	assert.deepEqual(fill(state, destination), undefined);
	assert.equal(escrows.records.size, 1);
	assert.equal([...escrows.records.values()][0], undefined);
});

test("FluidNetworkState resumes a Tank-to-world delivery from its persisted delivery escrow", () => {
	const storage = memoryStorage();
	const cell = worldCell({ states: {}, typeId: "minecraft:air" });
	const escrows = worldEscrows();
	const createPort = () => new VanillaWorldFluidPort({
		escrows: escrows.adapter,
		id: "world:target:restart",
		readBlock() {
			return cell.read();
		},
		writeBlock(block) {
			cell.write(block);
		}
	});
	const factory = () => createPort();
	const first = createState(storage, "createbedrock:fluid_state_world_delivery", { externalPortFactory: factory });
	const source = first.createTank({ dimensionId: "minecraft:overworld", location: { x: 0, y: 64, z: 0 } });
	first.insert(source, { amount: 1_000, typeId: "minecraft:water" });
	first.registerExternalPort({
		descriptor: { kind: "test_world_sink" },
		partition: "minecraft:overworld:1:4:0",
		port: createPort()
	});
	first.createPump({ destinationId: "world:target:restart", id: "pump:world-delivery", maxAmountPerTick: 1_000, sourceId: source });
	advance(first, () => first.snapshot().find(record => record.kind === "transfer")?.transfer.delivery?.escrowId !== undefined && !first.diagnostics().waitingForCommit);
	assert.deepEqual(cell.read(), { states: {}, typeId: "minecraft:air" });
	assert.equal(escrows.records.size, 1);

	const restored = createState(storage, "createbedrock:fluid_state_world_delivery", { externalPortFactory: factory });
	assert.deepEqual(restored.restore(), { frozen: false, links: 1, tanks: 1, transfers: 1, warnings: [] });
	advance(restored, () => cell.read().typeId === "minecraft:water" && restored.diagnostics().retiringExternalEscrows === 0 && !restored.diagnostics().waitingForCommit);
	assert.deepEqual(fill(restored, source), undefined);
	assert.deepEqual(cell.read(), { states: { liquid_depth: 0 }, typeId: "minecraft:water" });
	assert.equal(escrows.records.size, 0);
});

test("FluidNetworkState freezes a Tank-to-world delivery when the target was externally filled without its escrow", () => {
	const storage = memoryStorage();
	const cell = worldCell({ states: {}, typeId: "minecraft:air" });
	const escrows = worldEscrows();
	const createPort = () => new VanillaWorldFluidPort({
		escrows: escrows.adapter,
		id: "world:target:conflict",
		readBlock() {
			return cell.read();
		},
		writeBlock(block) {
			cell.write(block);
		}
	});
	const state = createState(storage, "createbedrock:fluid_state_world_delivery_conflict", {
		externalPortFactory() {
			return createPort();
		}
	});
	const source = state.createTank({ dimensionId: "minecraft:overworld", location: { x: 0, y: 64, z: 0 } });
	state.insert(source, { amount: 1_000, typeId: "minecraft:water" });
	state.registerExternalPort({
		descriptor: { kind: "test_world_sink" },
		partition: "minecraft:overworld:1:4:0",
		port: createPort()
	});
	state.createPump({ destinationId: "world:target:conflict", id: "pump:world-delivery-conflict", maxAmountPerTick: 1_000, sourceId: source });
	advance(state, () => state.snapshot().find(record => record.kind === "transfer")?.transfer.delivery?.escrowId !== undefined && !state.diagnostics().waitingForCommit);
	cell.write({ states: { liquid_depth: 0 }, typeId: "minecraft:water" });
	state.tick();
	assert.equal(state.diagnostics().frozen, true);
	assert.deepEqual(fill(state, source), undefined);
	assert.equal(escrows.records.size, 1);
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
