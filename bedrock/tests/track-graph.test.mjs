import assert from "node:assert/strict";
import test from "node:test";

import { TrackGraph } from "../behavior_pack/scripts/trains/track-graph.js";

function createGraph() {
	const graph = new TrackGraph();
	for (const id of ["a", "b", "c", "d"])
		graph.addNode({ id, location: { x: 0, y: 0, z: 0 } });

	graph.connect("a", "b", 2);
	graph.connect("b", "d", 2);
	graph.connect("a", "c", 1);
	graph.connect("c", "d", 10);
	return graph;
}

test("TrackGraph chooses the shortest unreserved route", () => {
	const route = createGraph().findRoute("a", "d");
	assert.deepEqual(route, {
		nodeIds: ["a", "b", "d"],
		edgeIds: ["a<->b", "b<->d"],
		length: 4
	});
});

test("TrackGraph reservations are atomic and block other trains", () => {
	const graph = createGraph();
	const route = graph.findRoute("a", "d");
	assert.equal(graph.tryReserve("train_one", route.edgeIds), true);
	assert.equal(graph.tryReserve("train_two", route.edgeIds), false);
	assert.equal(graph.releaseReservations("train_one"), 2);
	assert.equal(graph.tryReserve("train_two", route.edgeIds), true);
});

test("TrackGraph routes around reserved edges when an alternative exists", () => {
	const graph = createGraph();
	assert.equal(graph.tryReserve("blocking_train", ["a<->b"]), true);
	assert.deepEqual(graph.findRoute("a", "d"), {
		nodeIds: ["a", "c", "d"],
		edgeIds: ["a<->c", "c<->d"],
		length: 11
	});
});

test("TrackGraph serializes and restores its topology", () => {
	const source = createGraph();
	const snapshot = source.snapshot();
	const restored = new TrackGraph();
	restored.restore(snapshot);
	assert.deepEqual(restored.findRoute("a", "d"), source.findRoute("a", "d"));
	assert.equal(restored.removeNode("b"), true);
	assert.equal(restored.findRoute("a", "d").length, 11);
});

test("TrackGraph rejects removal of a node on a reserved route", () => {
	const graph = createGraph();
	const route = graph.findRoute("a", "d");
	graph.tryReserve("train_one", route.edgeIds);
	assert.equal(graph.canRemoveNode("b"), false);
	assert.throws(() => graph.removeNode("b"), /reserved/);
	graph.releaseReservations("train_one");
	assert.equal(graph.canRemoveNode("b"), true);
});
