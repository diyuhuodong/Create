import assert from "node:assert/strict";
import test from "node:test";

import { TrackGraph } from "../behavior_pack/scripts/trains/track-graph.js";
import { TrainController } from "../behavior_pack/scripts/trains/train-controller.js";

function createController({ registerTrain = true } = {}) {
	const graph = new TrackGraph();
	for (const id of ["a", "b", "c"])
		graph.addNode({ id, location: { x: 0, y: 0, z: 0 } });
	graph.connect("a", "b", 4);
	graph.connect("b", "c", 4);
	const controller = new TrainController(graph);
	if (registerTrain)
		controller.registerTrain({ id: "train_one", nodeId: "a" });
	return { controller, graph };
}

test("TrainController reserves a route, moves edge by edge, and releases it at destination", () => {
	const { controller, graph } = createController();
	assert.equal(controller.dispatch("train_one", "c"), true);
	assert.equal(graph.tryReserve("train_two", ["a<->b"]), false);
	assert.deepEqual(controller.tick("train_one", 4), {
		id: "train_one",
		nodeId: "b",
		edgeIndex: 1,
		distanceOnEdge: 0,
		destinationId: "c"
	});
	assert.equal(graph.tryReserve("train_two", ["a<->b"]), true);
	assert.deepEqual(controller.tick("train_one", 4), {
		id: "train_one",
		nodeId: "c",
		edgeIndex: 2,
		distanceOnEdge: 0,
		destinationId: undefined
	});
});

test("TrainController refuses to dispatch an already moving train", () => {
	const { controller } = createController();
	assert.equal(controller.dispatch("train_one", "c"), true);
	assert.equal(controller.dispatch("train_one", "b"), false);
});

test("TrainController restores a moving train and reclaims its route", () => {
	const source = createController();
	source.controller.dispatch("train_one", "c");
	source.controller.tick("train_one", 2);

	const restored = createController({ registerTrain: false });
	restored.controller.restore(source.controller.snapshot());
	assert.deepEqual(restored.controller.getTrain("train_one"), {
		id: "train_one",
		nodeId: "a",
		edgeIndex: 0,
		distanceOnEdge: 2,
		destinationId: "c"
	});
	assert.equal(restored.graph.tryReserve("train_two", ["a<->b"]), false);
});
