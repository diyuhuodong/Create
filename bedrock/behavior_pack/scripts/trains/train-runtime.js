import { system, world } from "@minecraft/server";

import { registerTickHandler } from "../kernel/index.js";
import { TrackGraph } from "./track-graph.js";
import { TrainController } from "./train-controller.js";

const TRACK_BLOCK = "createbedrock:track";
const TRAIN_ENTITY = "createbedrock:train";
const TRAIN_ID_PROPERTY = "createbedrock:train_id";
const PERSISTENCE_KEY = "createbedrock:trains_v1";
const TRACK_CONNECTION_OFFSETS = [
	[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
	[1, 1, 0], [1, -1, 0], [-1, 1, 0], [-1, -1, 0],
	[0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]
];
const graphs = new Map();
const controllers = new Map();
const trains = new Map();
const selections = new Map();
let nextTrainId = 1;
let ticksSincePersist = 0;

function nodeId(location) {
	return `${location.x}:${location.y}:${location.z}`;
}

function graphFor(dimensionId) {
	let graph = graphs.get(dimensionId);
	if (!graph) {
		graph = new TrackGraph();
		graphs.set(dimensionId, graph);
	}
	return graph;
}

function controllerFor(dimensionId) {
	let controller = controllers.get(dimensionId);
	if (!controller) {
		controller = new TrainController(graphFor(dimensionId));
		controllers.set(dimensionId, controller);
	}
	return controller;
}

function nodeLocation(dimensionId, id) {
	const node = graphFor(dimensionId).getNode(id);
	if (!node)
		throw new Error(`Unknown train node ${id}`);
	return node.location;
}

function markerLocation(location) {
	return { x: location.x + 0.5, y: location.y + 1, z: location.z + 0.5 };
}

function locationForTrain(dimensionId, state) {
	if (!state.fromNodeId || !state.toNodeId)
		return nodeLocation(dimensionId, state.nodeId);
	const from = nodeLocation(dimensionId, state.fromNodeId);
	const to = nodeLocation(dimensionId, state.toNodeId);
	return {
		x: from.x + (to.x - from.x) * state.progress,
		y: from.y + (to.y - from.y) * state.progress,
		z: from.z + (to.z - from.z) * state.progress
	};
}

function spawnMarker(dimensionId, trainId, location) {
	const dimension = world.getDimension(dimensionId);
	const existing = dimension.getEntities({ type: TRAIN_ENTITY })
		.find(entity => entity.getDynamicProperty(TRAIN_ID_PROPERTY) === trainId);
	if (existing?.isValid) {
		existing.teleport(markerLocation(location));
		return existing.id;
	}

	const entity = dimension.spawnEntity(TRAIN_ENTITY, markerLocation(location));
	entity.setDynamicProperty(TRAIN_ID_PROPERTY, trainId);
	return entity.id;
}

function persist() {
	const dimensions = [...graphs.keys()].map(dimensionId => ({
		dimensionId,
		graph: graphFor(dimensionId).snapshot(),
		trains: controllerFor(dimensionId).snapshot()
	}));
	world.setDynamicProperty(PERSISTENCE_KEY, JSON.stringify({ dimensions, nextTrainId }));
}

function restore() {
	const serialized = world.getDynamicProperty(PERSISTENCE_KEY);
	if (typeof serialized !== "string")
		return;

	try {
		const snapshot = JSON.parse(serialized);
		nextTrainId = snapshot.nextTrainId ?? 1;
		for (const dimension of snapshot.dimensions ?? []) {
			const graph = graphFor(dimension.dimensionId);
			graph.restore(dimension.graph);
			const controller = controllerFor(dimension.dimensionId);
			controller.restore(dimension.trains);
			for (const train of dimension.trains) {
				const state = controller.getTrain(train.id);
				trains.set(train.id, {
					dimensionId: dimension.dimensionId,
					entityId: spawnMarker(dimension.dimensionId, train.id, locationForTrain(dimension.dimensionId, state))
				});
			}
		}
	} catch (error) {
		console.warn(`[Create Bedrock] Ignored invalid train state: ${error}`);
	}
}

function addTrack(block) {
	const dimensionId = block.dimension.id;
	const graph = graphFor(dimensionId);
	const id = nodeId(block.location);
	if (graph.getNode(id))
		return;

	graph.addNode({ id, location: { ...block.location } });
	for (const [x, y, z] of TRACK_CONNECTION_OFFSETS) {
		const adjacent = { x: block.location.x + x, y: block.location.y + y, z: block.location.z + z };
		const adjacentId = nodeId(adjacent);
		if (graph.getNode(adjacentId))
			graph.connect(id, adjacentId, Math.hypot(x, y, z));
	}
	persist();
}

function createTrain(dimensionId, nodeIdValue) {
	const id = `train:${nextTrainId++}`;
	const controller = controllerFor(dimensionId);
	controller.registerTrain({ id, nodeId: nodeIdValue });
	trains.set(id, {
		dimensionId,
		entityId: spawnMarker(dimensionId, id, nodeLocation(dimensionId, nodeIdValue))
	});
	return id;
}

function selectRoute(player, dimensionId, destinationId) {
	const selection = selections.get(player.id);
	if (!selection) {
		selections.set(player.id, { dimensionId, nodeId: destinationId });
		return;
	}
	selections.delete(player.id);
	if (selection.dimensionId !== dimensionId || selection.nodeId === destinationId)
		return;

	const controller = controllerFor(dimensionId);
	let trainId = [...trains.entries()]
		.find(([id, train]) => train.dimensionId === dimensionId && controller.getTrain(id).nodeId === selection.nodeId && !controller.getTrain(id).destinationId)?.[0];
	if (!trainId)
		trainId = createTrain(dimensionId, selection.nodeId);
	if (controller.dispatch(trainId, destinationId))
		persist();
}

function tickTrains() {
	for (const [id, train] of trains) {
		const controller = controllerFor(train.dimensionId);
		const wasMoving = controller.getTrain(id).edgeId !== undefined;
		const state = controller.tick(id, 0.1);
		if (!wasMoving && state.edgeId === undefined)
			continue;
		const entity = world.getEntity(train.entityId);
		if (entity?.isValid)
			entity.teleport(markerLocation(locationForTrain(train.dimensionId, state)));
	}

	ticksSincePersist++;
	if (ticksSincePersist >= 20) {
		ticksSincePersist = 0;
		persist();
	}
}

export function registerTrains() {
	world.afterEvents.playerPlaceBlock.subscribe(event => {
		if (event.block.typeId === TRACK_BLOCK)
			addTrack(event.block);
	});

	world.beforeEvents.playerBreakBlock.subscribe(event => {
		if (event.block.typeId !== TRACK_BLOCK)
			return;
		const graph = graphs.get(event.block.dimension.id);
		if (!graph?.canRemoveNode(nodeId(event.block.location))) {
			event.cancel = true;
			event.player.sendMessage("Cannot remove a track reserved by an active train.");
		}
	});

	world.afterEvents.playerBreakBlock.subscribe(event => {
		const graph = graphs.get(event.dimension.id);
		if (!graph)
			return;
		try {
			if (graph.removeNode(nodeId(event.block.location)))
				persist();
		} catch (error) {
			console.warn(`[Create Bedrock] Track removal deferred: ${error}`);
		}
	});

	world.afterEvents.playerInteractWithBlock.subscribe(event => {
		if (event.block.typeId === TRACK_BLOCK)
			selectRoute(event.player, event.block.dimension.id, nodeId(event.block.location));
	});

	registerTickHandler(tickTrains);
	system.run(restore);
}
