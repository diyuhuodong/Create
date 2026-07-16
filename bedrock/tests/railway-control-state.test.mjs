import assert from "node:assert/strict";
import test from "node:test";

import { controllerRailTransition, observerMatchesTrain, passingTrainForEdge, SIGNAL_STATE, signalStateFor } from "../behavior_pack/scripts/trains/railway-control-state.js";

test("railway signal state fails closed and respects an occupied passage token", () => {
	assert.equal(signalStateFor({ edge: undefined, edgeAvailable: false }), SIGNAL_STATE.INVALID);
	assert.equal(signalStateFor({ edge: { reservedBy: "train:one" }, edgeAvailable: true }), SIGNAL_STATE.RED);
	assert.equal(signalStateFor({ adjacentReserved: true, edge: {}, edgeAvailable: true }), SIGNAL_STATE.YELLOW);
	assert.equal(signalStateFor({ edge: {}, edgeAvailable: true }), SIGNAL_STATE.GREEN);
});

test("observers filter authoritative edge passages and controller rails only release trains they held", () => {
	assert.equal(observerMatchesTrain("express", "train:express:one"), true);
	assert.equal(passingTrainForEdge({ edgeId: "a<->b", filter: "express", trains: [{ edgeId: "a<->b", id: "train:local" }, { edgeId: "a<->b", id: "train:express" }] }), "train:express");
	assert.deepEqual(controllerRailTransition({ heldTrainIds: ["train:one"], powered: false, trains: [{ id: "train:one" }, { id: "train:two" }] }), { release: ["train:one"], stop: [] });
});
