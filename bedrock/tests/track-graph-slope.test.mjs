import assert from "node:assert/strict";
import test from "node:test";

import { TrackGraph } from "../behavior_pack/scripts/trains/track-graph.js";
import { TrainController } from "../behavior_pack/scripts/trains/train-controller.js";

test("TrainController interpolates a sloped track edge in three dimensions", () => {
	const graph = new TrackGraph();
	graph.addNode({ id: "lower", location: { x: 0, y: 64, z: 0 } });
	graph.addNode({ id: "upper", location: { x: 1, y: 65, z: 0 } });
	graph.connect("lower", "upper", Math.SQRT2);
	const trains = new TrainController(graph);
	trains.registerTrain({ id: "train", nodeId: "lower" });
	assert.equal(trains.dispatch("train", "upper"), true);

	const state = trains.tick("train", Math.SQRT2 / 2);
	assert.equal(state.fromNodeId, "lower");
	assert.equal(state.toNodeId, "upper");
	assert.equal(state.progress, 0.5);
});
