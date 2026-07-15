import assert from "node:assert/strict";
import test from "node:test";

import {
	captureMovingBlockData,
	detachMovingBlockData,
	hasMovingBlockDataAdapter,
	registerMovingBlockDataAdapter,
	registerMovingBlockDataContributor,
	registerStatelessMovingBlockDataAdapter,
	restoreMovingBlockData
} from "../behavior_pack/scripts/contraptions/moving-block-data.js";
import { registerKineticMovingDataAdapters } from "../behavior_pack/scripts/contraptions/kinetic-moving-data-adapter.js";
import { KineticWorld } from "../behavior_pack/scripts/kinetics/kinetic-world.js";

test("moving block data adapters transfer state through capture, detach, and restore", () => {
	const state = new Map([["minecraft:overworld:1:64:1", { progress: 12 }]]);
	const key = (dimensionId, location) => `${dimensionId}:${location.x}:${location.y}:${location.z}`;
	registerMovingBlockDataAdapter("test:machine", {
		capture(dimensionId, location) {
			return state.get(key(dimensionId, location));
		},
		detach(dimensionId, location) {
			const value = state.get(key(dimensionId, location));
			state.delete(key(dimensionId, location));
			return value;
		},
		restore(dimensionId, location, value) {
			state.set(key(dimensionId, location), value);
		}
	});

	const source = { x: 1, y: 64, z: 1 };
	const target = { x: 3, y: 64, z: 1 };
	assert.deepEqual(captureMovingBlockData("test:machine", "minecraft:overworld", source), { progress: 12 });
	assert.deepEqual(detachMovingBlockData("test:machine", "minecraft:overworld", source), { progress: 12 });
	assert.equal(captureMovingBlockData("test:machine", "minecraft:overworld", source), undefined);
	restoreMovingBlockData("test:machine", "minecraft:overworld", target, { progress: 12 });
	assert.deepEqual(captureMovingBlockData("test:machine", "minecraft:overworld", target), { progress: 12 });
});

test("stateless moving-block adapters make structural contraption parts explicit", () => {
	registerStatelessMovingBlockDataAdapter("test:structural_block");
	const location = { x: 1, y: 64, z: 1 };
	assert.equal(hasMovingBlockDataAdapter("test:structural_block"), true);
	assert.equal(captureMovingBlockData("test:structural_block", "minecraft:overworld", location), undefined);
	assert.equal(detachMovingBlockData("test:structural_block", "minecraft:overworld", location), undefined);
	assert.equal(restoreMovingBlockData("test:structural_block", "minecraft:overworld", location), undefined);
});

test("versioned moving block data rejects incompatible payloads and accepts pre-envelope snapshots", () => {
	const restored = [];
	registerMovingBlockDataAdapter("test:versioned", {
		capture() { return { progress: 3 }; },
		detach() {},
		restore(dimensionId, location, value) { restored.push({ dimensionId, location, value }); },
		schemaVersion: 2,
		validate(value) {
			if (!Number.isInteger(value?.progress))
				throw new TypeError("progress is required");
		}
	});
	const location = { x: 1, y: 64, z: 1 };
	assert.deepEqual(captureMovingBlockData("test:versioned", "minecraft:overworld", location), {
		adapterSchemaVersion: 2,
		payload: { progress: 3 }
	});
	assert.throws(() => restoreMovingBlockData("test:versioned", "minecraft:overworld", location, {
		adapterSchemaVersion: 1,
		payload: { progress: 3 }
	}), /incompatible/);
	restoreMovingBlockData("test:versioned", "minecraft:overworld", location, { progress: 2 });
	assert.deepEqual(restored[0].value, { progress: 2 });
});

test("moving data contributors preserve independent kinetic and machine payloads for one block", () => {
	const calls = [];
	registerMovingBlockDataAdapter("test:combined", {
		capture() { return { queue: ["minecraft:iron_ingot"] }; },
		detach() { calls.push("machine-detach"); },
		restore(dimensionId, location, value) { calls.push({ dimensionId, location, machine: value }); },
		schemaVersion: 1
	});
	registerMovingBlockDataContributor("test:combined", "kinetic", {
		capture() { return { generatedSpeed: 32, typeId: "test:combined" }; },
		detach() { calls.push("kinetic-detach"); },
		restore(dimensionId, location, value) { calls.push({ dimensionId, kinetic: value, location }); },
		schemaVersion: 1
	});
	const location = { x: 2, y: 64, z: 2 };
	const captured = captureMovingBlockData("test:combined", "minecraft:overworld", location);
	assert.deepEqual(captured, {
		assemblyDataSchema: 1,
		contributors: {
			default: { adapterSchemaVersion: 1, payload: { queue: ["minecraft:iron_ingot"] } },
			kinetic: { adapterSchemaVersion: 1, payload: { generatedSpeed: 32, typeId: "test:combined" } }
		}
	});
	detachMovingBlockData("test:combined", "minecraft:overworld", location);
	restoreMovingBlockData("test:combined", "minecraft:overworld", location, captured);
	assert.deepEqual(calls, [
		"machine-detach",
		"kinetic-detach",
		{ dimensionId: "minecraft:overworld", location, machine: { queue: ["minecraft:iron_ingot"] } },
		{ dimensionId: "minecraft:overworld", kinetic: { generatedSpeed: 32, typeId: "test:combined" }, location }
	]);
});

test("kinetic contributor preserves configurable source state across an assembly capture", () => {
	const kineticWorld = new KineticWorld();
	const location = { x: 8, y: 64, z: 8 };
	kineticWorld.trackPlacedBlock({
		dimension: { id: "minecraft:overworld" },
		location,
		typeId: "createbedrock:creative_motor"
	});
	kineticWorld.setGeneratedSpeed("minecraft:overworld", location, -128);
	registerKineticMovingDataAdapters(kineticWorld);
	const captured = captureMovingBlockData("createbedrock:creative_motor", "minecraft:overworld", location);
	assert.equal(captured.adapterSchemaVersion, 1);
	assert.equal(captured.payload.generatedSpeed, -128);
	kineticWorld.trackBrokenBlock("minecraft:overworld", location);
	restoreMovingBlockData("createbedrock:creative_motor", "minecraft:overworld", { x: 9, y: 64, z: 8 }, captured);
	assert.equal(kineticWorld.generatedSpeedAt("minecraft:overworld", { x: 9, y: 64, z: 8 }), -128);
});
