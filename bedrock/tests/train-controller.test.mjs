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
		destinationId: "c",
		edgeId: "b<->c",
		fromNodeId: "b",
		toNodeId: "c",
		edgeLength: 4,
		progress: 0
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

test("TrainController reports why a dispatch cannot start", () => {
	const { controller, graph } = createController();
	assert.deepEqual(controller.dispatchWithReason("train_one", "missing"), {
		ok: false,
		reason: "unknown_destination"
	});
	graph.setNodeAvailable("b", false);
	assert.deepEqual(controller.dispatchWithReason("train_one", "b"), {
		ok: false,
		reason: "route_unavailable"
	});
	graph.setNodeAvailable("b", true);
	assert.equal(controller.dispatch("train_one", "b"), true);
	assert.deepEqual(controller.dispatchWithReason("train_one", "c"), {
		ok: false,
		reason: "already_moving"
	});
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
		destinationId: "c",
		edgeId: "a<->b",
		fromNodeId: "a",
		toNodeId: "b",
		edgeLength: 4,
		progress: 0.5
	});
	assert.equal(restored.graph.tryReserve("train_two", ["a<->b"]), false);
});

test("TrainController exposes continuous position within a reserved edge", () => {
	const { controller } = createController();
	controller.dispatch("train_one", "b");
	assert.deepEqual(controller.tick("train_one", 1), {
		id: "train_one",
		nodeId: "a",
		edgeIndex: 0,
		distanceOnEdge: 1,
		destinationId: "b",
		edgeId: "a<->b",
		fromNodeId: "a",
		toNodeId: "b",
		edgeLength: 4,
		progress: 0.25
	});
});

test("TrainController clears its active edge only after reaching the destination", () => {
	const { controller } = createController();
	controller.dispatch("train_one", "b");
	assert.ok(controller.tick("train_one", 3.9).edgeId);
	assert.equal(controller.tick("train_one", 0.1).edgeId, undefined);
});

test("TrainController persists a looping station schedule with dwell time", () => {
	const graph = new TrackGraph();
	graph.addNode({ id: "a", location: { x: 0, y: 64, z: 0 } });
	graph.addNode({ id: "b", location: { x: 1, y: 64, z: 0 } });
	graph.connect("a", "b", 1);
	const controller = new TrainController(graph);
	controller.registerTrain({ id: "train-1", nodeId: "a" });

	assert.equal(controller.setSchedule("train-1", { dwellTicks: 1, stopIds: ["b", "a"] }), true);
	controller.tick("train-1", 1);
	assert.equal(controller.getTrain("train-1").nodeId, "b");
	assert.equal(controller.getTrain("train-1").schedule.dwellRemaining, 1);
	controller.tick("train-1", 0.1);
	controller.tick("train-1", 0.1);
	assert.equal(controller.getTrain("train-1").destinationId, "a");

	const restored = new TrainController(graph);
	restored.restore(controller.snapshot());
	assert.deepEqual(restored.getTrain("train-1").schedule.stopIds, ["b", "a"]);
});

test("TrainController arms an unavailable station loop in a waiting state", () => {
	const { controller, graph } = createController();
	graph.setNodeAvailable("b", false);
	assert.deepEqual(controller.setScheduleWithReason("train_one", {
		dwellTicks: 1,
		stopIds: ["b", "a"]
	}), { ok: true, state: "waiting" });
	assert.deepEqual(controller.setScheduleWithReason("train_one", {
		stopIds: ["missing"]
	}), { ok: false, reason: "unknown_station" });
	assert.deepEqual(controller.getTrain("train_one").schedule.stopIds, ["b", "a"]);
});

test("TrainController keeps carriage positions ordered along the reserved route", () => {
	const { controller } = createController({ registerTrain: false });
	controller.registerTrain({ carriageCount: 3, carriageSpacing: 2, id: "train_one", nodeId: "a" });
	controller.dispatch("train_one", "c");
	controller.tick("train_one", 5);

	assert.deepEqual(controller.getCarriages("train_one"), [
		{ edgeLength: 4, fromNodeId: "b", index: 0, progress: 0.25, toNodeId: "c" },
		{ edgeLength: 4, fromNodeId: "a", index: 1, progress: 0.75, toNodeId: "b" },
		{ edgeLength: 4, fromNodeId: "a", index: 2, progress: 0.25, toNodeId: "b" }
	]);
	const restored = createController({ registerTrain: false });
	restored.controller.restore(controller.snapshot());
	assert.equal(restored.controller.getCarriages("train_one").length, 3);
});

test("TrainController places carriages by arc length along track geometry", () => {
	const graph = new TrackGraph();
	graph.addNode({ id: "a", location: { x: 0, y: 64, z: 0 } });
	graph.addNode({ id: "b", location: { x: 1, y: 64, z: 1 } });
	graph.connect("a", "b", undefined, [
		{ x: 0, y: 64, z: 0 },
		{ x: 1, y: 64, z: 0 },
		{ x: 1, y: 64, z: 1 }
	]);
	const controller = new TrainController(graph);
	controller.registerTrain({ id: "train_one", nodeId: "a" });
	controller.dispatch("train_one", "b");
	controller.tick("train_one", 1);

	assert.deepEqual(controller.getCarriagePlacements("train_one")[0].location, { x: 1, y: 64, z: 0 });
});

test("TrainController keeps an edge reserved until the last carriage clears it", () => {
	const { controller, graph } = createController({ registerTrain: false });
	controller.registerTrain({ carriageCount: 2, carriageSpacing: 2, id: "train_one", nodeId: "a" });
	controller.dispatch("train_one", "c");

	controller.tick("train_one", 4);
	assert.equal(graph.tryReserve("train_two", ["a<->b"]), false);
	controller.tick("train_one", 2);
	assert.equal(graph.tryReserve("train_two", ["a<->b"]), true);
});

test("TrainController restores only the route edges still occupied by its formation", () => {
	const source = createController({ registerTrain: false });
	source.controller.registerTrain({ carriageCount: 2, carriageSpacing: 2, id: "train_one", nodeId: "a" });
	source.controller.dispatch("train_one", "c");
	source.controller.tick("train_one", 6);

	const restored = createController({ registerTrain: false });
	restored.controller.restore(source.controller.snapshot());
	assert.equal(restored.graph.tryReserve("train_two", ["a<->b"]), true);
	assert.equal(restored.graph.tryReserve("train_two", ["b<->c"]), false);
});

test("TrainController waits without changing progress while its active edge is unavailable", () => {
	const { controller, graph } = createController();
	controller.dispatch("train_one", "c");
	controller.tick("train_one", 1);
	graph.setNodeAvailable("b", false);

	const waiting = controller.tick("train_one", 2);
	assert.equal(waiting.distanceOnEdge, 1);
	assert.equal(waiting.progress, 0.25);
	graph.setNodeAvailable("b", true);
	assert.equal(controller.tick("train_one", 2).distanceOnEdge, 3);
});

test("TrainController persists speed, direction, and manual stop state", () => {
	const { controller } = createController({ registerTrain: false });
	controller.registerTrain({ id: "train_one", nodeId: "c", speed: 0.5 });
	controller.dispatch("train_one", "a");
	assert.deepEqual(controller.getMotionState("train_one"), {
		blockedReason: undefined,
		direction: -1,
		speed: 0,
		stopped: false,
		targetSpeed: 0.5
	});
	assert.equal(controller.setStopped("train_one", true), true);
	controller.tick("train_one");
	assert.equal(controller.getTrain("train_one").distanceOnEdge, 0);

	const snapshot = controller.snapshot();
	const restored = createController({ registerTrain: false }).controller;
	restored.restore(snapshot);
	assert.deepEqual(restored.getMotionState("train_one"), {
		blockedReason: undefined,
		direction: -1,
		speed: 0,
		stopped: true,
		targetSpeed: 0.5
	});
	assert.equal(restored.setStopped("train_one", false), true);
	restored.tick("train_one");
	assert.equal(restored.getTrain("train_one").distanceOnEdge, 0.5);
});

test("TrainController applies motion defaults when restoring an older record", () => {
	const source = createController();
	source.controller.dispatch("train_one", "b");
	const [record] = source.controller.snapshot();
	delete record.direction;
	delete record.speed;
	delete record.stopped;
	delete record.targetSpeed;

	const restored = createController({ registerTrain: false }).controller;
	restored.restore([record]);
	assert.deepEqual(restored.getMotionState("train_one"), {
		blockedReason: undefined,
		direction: 1,
		speed: 0,
		stopped: false,
		targetSpeed: 0.1
	});
});

test("TrainController freezes collision-blocked trains and persists the reason", () => {
	const { controller } = createController();
	controller.dispatch("train_one", "b");
	assert.equal(controller.setBlocked("train_one", "world_blocked:1:65:0"), true);
	controller.tick("train_one", 1);
	assert.equal(controller.getTrain("train_one").distanceOnEdge, 0);
	assert.equal(controller.getMotionState("train_one").blockedReason, "world_blocked:1:65:0");

	const restored = createController({ registerTrain: false }).controller;
	restored.restore(controller.snapshot());
	assert.equal(restored.getMotionState("train_one").blockedReason, "world_blocked:1:65:0");
	assert.equal(restored.setBlocked("train_one"), true);
	restored.tick("train_one", 1);
	assert.equal(restored.getTrain("train_one").distanceOnEdge, 1);
});
