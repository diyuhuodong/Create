import assert from "node:assert/strict";
import test from "node:test";

import { ElevatorColumnRegistry } from "../behavior_pack/scripts/contraptions/elevator-column.js";

const dimensionId = "minecraft:overworld";
const ground = { x: 4, y: 64, z: -2 };
const upper = { x: 4, y: 80, z: -2 };
const column = { facing: "north", x: 4, z: -2 };

test("ElevatorColumnRegistry registers stable floor names and transitions a requested target once", () => {
	const registry = new ElevatorColumnRegistry();
	registry.registerContact({ dimensionId, facing: "north", floorId: "G", floorName: "Ground", location: ground });
	registry.registerContact({ dimensionId, facing: "north", floorId: "2", floorName: "Workshop", location: upper });
	assert.deepEqual(registry.contactsInColumn(dimensionId, column).map(contact => contact.floorId), ["G", "2"]);
	assert.deepEqual(registry.requestFloor({ column, dimensionId, floorId: "2" }), {
		ok: true,
		target: { dimensionId, facing: "north", floorId: "2", floorName: "Workshop", location: upper, revision: 0 }
	});
	assert.equal(registry.columnState(dimensionId, column)?.active, true);
	const reached = registry.reportFloorReached({ dimensionId, location: upper });
	assert.equal(reached.currentFloorName, "Workshop");
	assert.equal(registry.columnState(dimensionId, column)?.active, false);
	assert.equal(registry.requestFloor({ column, dimensionId, floorId: "missing" }).reason, "unknown_floor");
});

test("ElevatorColumnRegistry applies revisioned floor configuration and restores columns", () => {
	const registry = new ElevatorColumnRegistry();
	registry.registerContact({ dimensionId, facing: "east", location: ground });
	const first = registry.contactAt(dimensionId, ground);
	assert.equal(registry.configureContact({
		dimensionId,
		expectedRevision: first.revision,
		location: ground,
		patch: { floorId: "lobby", floorName: "Lobby" }
	}).changed, true);
	assert.equal(registry.configureContact({
		dimensionId,
		expectedRevision: first.revision,
		location: ground,
		patch: { floorName: "stale" }
	}).conflict, true);
	const restored = new ElevatorColumnRegistry();
	restored.restore(registry.snapshot());
	assert.deepEqual(restored.contactAt(dimensionId, ground), {
		dimensionId, facing: "east", floorId: "lobby", floorName: "Lobby", location: ground, revision: 1
	});
	assert.equal(restored.removeContact(dimensionId, ground), true);
	assert.equal(restored.columnState(dimensionId, { facing: "east", x: 4, z: -2 }), undefined);
});
