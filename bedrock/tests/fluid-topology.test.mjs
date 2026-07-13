import assert from "node:assert/strict";
import test from "node:test";

import { configureFluidDevice, fluidDeviceId, fluidDeviceLocation, offsetFluidLocation } from "../behavior_pack/scripts/fluids/fluid-topology.js";

test("Fluid topology creates a directional pipe between opposing tank endpoints", () => {
	const calls = [];
	const result = configureFluidDevice({
		createLink(options) {
			calls.push(options);
		},
		device: { dimensionId: "minecraft:overworld", location: { x: 1, y: 64, z: 0 } },
		facing: "east",
		kind: "pipe",
		tankAt(location) {
			return ({ "0:64:0": "tank:source", "2:64:0": "tank:destination" })[`${location.x}:${location.y}:${location.z}`];
		}
	});
	assert.deepEqual(result, { id: "pipe:minecraft:overworld:1:64:0", ok: true, reused: false });
	assert.deepEqual(calls, [{ destinationId: "tank:destination", id: "pipe:minecraft:overworld:1:64:0", sourceId: "tank:source" }]);
});

test("Fluid topology rejects incomplete endpoints and reuses a restored pump link", () => {
	assert.deepEqual(configureFluidDevice({
		createLink() {
			throw new Error("must not create");
		},
		device: { dimensionId: "minecraft:overworld", location: { x: 0, y: 65, z: 0 } },
		facing: "down",
		kind: "pump",
		tankAt() {
			return undefined;
		}
	}), { ok: false, reason: "endpoints_missing" });
	assert.deepEqual(configureFluidDevice({
		createLink() {
			throw new Error("must not create");
		},
		device: { dimensionId: "minecraft:overworld", location: { x: 0, y: 65, z: 0 } },
		facing: "down",
		hasLink() {
			return true;
		},
		kind: "pump",
		tankAt() {
			return undefined;
		}
	}), { id: "pump:minecraft:overworld:0:65:0", ok: true, reused: true });
});

test("Fluid device identifiers retain namespaced dimensions and reject unstable values", () => {
	const id = fluidDeviceId("pump", "create:test:dimension", { x: -1, y: 64, z: 20 });
	assert.equal(id, "pump:create:test:dimension:-1:64:20");
	assert.deepEqual(fluidDeviceLocation("pump", id), { dimensionId: "create:test:dimension", location: { x: -1, y: 64, z: 20 } });
	assert.equal(fluidDeviceLocation("pipe", id), undefined);
	assert.deepEqual(offsetFluidLocation({ x: 1, y: 2, z: 3 }, { x: -1, y: 0, z: 4 }), { x: 0, y: 2, z: 7 });
	assert.throws(() => fluidDeviceId("pump", "minecraft:overworld", { x: 0.5, y: 64, z: 0 }), /integer/);
});
