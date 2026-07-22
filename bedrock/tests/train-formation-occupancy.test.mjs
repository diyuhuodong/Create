import assert from "node:assert/strict";
import test from "node:test";

import { bindFormationPassenger, createTrainFormation, releaseFormationPassenger, setFormationDoors, trainFormationLength } from "../behavior_pack/scripts/trains/train-formation.js";
import { TrainOccupancyAuthority } from "../behavior_pack/scripts/trains/train-occupancy.js";

test("train formations persist carriage, bogey, seat, and platform-door semantics", () => {
	let formation = createTrainFormation({ carriages: [{
		bogeyOffsets: [1, 3],
		doors: [{ id: "door:left", side: "left" }, { id: "door:right", side: "right" }],
		id: "carriage:a",
		length: 4,
		seats: [{ id: "seat:a", offset: { x: 0, y: 1, z: 0 } }]
	}] });
	assert.equal(trainFormationLength(formation), 4);
	formation = bindFormationPassenger(formation, { carriageId: "carriage:a", passengerId: "player:a", seatId: "seat:a" });
	assert.equal(formation.carriages[0].seats[0].passengerId, "player:a");
	const released = releaseFormationPassenger(formation, "player:a");
	assert.equal(released.changed, true);
	assert.equal(released.formation.carriages[0].seats[0].passengerId, undefined);
	assert.equal(setFormationDoors(formation, { alignedSide: "left", speed: 0 }).carriages[0].doors[0].open, true);
	assert.equal(setFormationDoors(formation, { alignedSide: "left", speed: .1 }).carriages[0].doors[0].open, false);
});

test("interval occupancy permits separated trains and rejects swept overlap atomically", () => {
	const occupancy = new TrainOccupancyAuthority({ graphRevision: 4 });
	assert.equal(occupancy.replace("train:a", [{ edgeId: "edge", start: 0, end: 2 }], { graphRevision: 4 }).ok, true);
	assert.equal(occupancy.replace("train:b", [{ edgeId: "edge", start: 4, end: 6 }], { graphRevision: 4 }).ok, true);
	assert.deepEqual(occupancy.replace("train:b", [{ edgeId: "edge", start: 2.1, end: 4 }], { graphRevision: 4 }), { ok: false, reason: "occupied" });
	assert.deepEqual(occupancy.claimsFor("train:b"), [{ edgeId: "edge", start: 4, end: 6 }]);
	assert.deepEqual(occupancy.replace("train:c", [{ edgeId: "edge", start: 7, end: 8 }], { graphRevision: 3 }), { ok: false, reason: "graph_revision_changed" });
});
