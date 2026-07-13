import { system, world } from "@minecraft/server";

import { registerKernelTaskGroup, registerTickHandler } from "../kernel/index.js";
import { deserializeVersionedState, serializeVersionedState } from "../kernel/versioned-state.js";
import { TrackGraph } from "./track-graph.js";
import { findTrainCollision } from "./train-collision.js";
import { TrainController } from "./train-controller.js";

const TRACK_BLOCK = "createbedrock:track";
const STATION_BLOCK = "createbedrock:track_station";
const TRAIN_ENTITY = "createbedrock:train";
const TRAIN_ID_PROPERTY = "createbedrock:train_id";
const TRAIN_CARRIAGE_INDEX_PROPERTY = "createbedrock:train_carriage_index";
const PERSISTENCE_KEY = "createbedrock:trains_v1";
const PERSISTENCE_SCHEMA_VERSION = 1;
const TRACK_CONNECTION_OFFSETS = [
	[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
	[1, 0, 1], [1, 0, -1], [-1, 0, 1], [-1, 0, -1],
	[1, 1, 0], [1, -1, 0], [-1, 1, 0], [-1, -1, 0],
	[0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]
];
const STATION_TRACK_OFFSETS = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
const graphs = new Map();
const controllers = new Map();
const trains = new Map();
const selections = new Map();
let nextTrainId = 1;
let ticksSincePersist = 0;
let ticksSinceAvailabilityCheck = 0;

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

function curvePoints(from, to) {
	const control = { x: to.x, y: from.y, z: from.z };
	return Array.from({ length: 9 }, (_, index) => {
		const progress = index / 8;
		const inverse = 1 - progress;
		return {
			x: inverse * inverse * from.x + 2 * inverse * progress * control.x + progress * progress * to.x,
			y: inverse * inverse * from.y + 2 * inverse * progress * control.y + progress * progress * to.y,
			z: inverse * inverse * from.z + 2 * inverse * progress * control.z + progress * progress * to.z
		};
	});
}

function locationForCarriage(dimensionId, carriage) {
	if (carriage.location)
		return carriage.location;
	if (!carriage.fromNodeId || !carriage.toNodeId)
		return nodeLocation(dimensionId, carriage.nodeId);
	const from = nodeLocation(dimensionId, carriage.fromNodeId);
	const to = nodeLocation(dimensionId, carriage.toNodeId);
	return {
		x: from.x + (to.x - from.x) * carriage.progress,
		y: from.y + (to.y - from.y) * carriage.progress,
		z: from.z + (to.z - from.z) * carriage.progress
	};
}

function spawnCarriageMarker(dimensionId, trainId, carriageIndex, location) {
	const dimension = world.getDimension(dimensionId);
	const existing = dimension.getEntities({ type: TRAIN_ENTITY })
		.find(entity => entity.getDynamicProperty(TRAIN_ID_PROPERTY) === trainId
			&& entity.getDynamicProperty(TRAIN_CARRIAGE_INDEX_PROPERTY) === carriageIndex);
	if (existing?.isValid) {
		existing.teleport(markerLocation(location));
		return existing.id;
	}

	const entity = dimension.spawnEntity(TRAIN_ENTITY, markerLocation(location));
	entity.setDynamicProperty(TRAIN_ID_PROPERTY, trainId);
	entity.setDynamicProperty(TRAIN_CARRIAGE_INDEX_PROPERTY, carriageIndex);
	return entity.id;
}

function spawnCarriageMarkers(dimensionId, trainId, controller) {
	return controller.getCarriagePlacements(trainId).map(carriage => spawnCarriageMarker(
		dimensionId,
		trainId,
		carriage.index,
		locationForCarriage(dimensionId, carriage)
	));
}

function persist() {
	const dimensions = [...graphs.keys()].map(dimensionId => ({
		dimensionId,
		graph: graphFor(dimensionId).snapshot(),
		trains: controllerFor(dimensionId).snapshot()
	}));
	world.setDynamicProperty(PERSISTENCE_KEY, serializeVersionedState(PERSISTENCE_SCHEMA_VERSION, { dimensions, nextTrainId }));
}

function restore() {
	const serialized = world.getDynamicProperty(PERSISTENCE_KEY);
	if (typeof serialized !== "string")
		return;

	try {
		const snapshot = deserializeVersionedState(serialized, {
			schemaVersion: PERSISTENCE_SCHEMA_VERSION,
			upgrades: {
				0: legacy => legacy
			}
		});
		nextTrainId = snapshot.nextTrainId ?? 1;
		for (const dimension of snapshot.dimensions ?? []) {
			try {
				if (typeof dimension?.dimensionId !== "string" || !dimension.graph || !Array.isArray(dimension.trains))
					throw new TypeError("missing dimension train state");
				const graph = graphFor(dimension.dimensionId);
				graph.restore(dimension.graph);
				const controller = controllerFor(dimension.dimensionId);
				for (const train of dimension.trains) {
					let restored = false;
					try {
						controller.restore([train]);
						restored = true;
						trains.set(train.id, {
							dimensionId: dimension.dimensionId,
							entityIds: spawnCarriageMarkers(dimension.dimensionId, train.id, controller)
						});
					} catch (error) {
						if (restored)
							controller.removeTrain(train.id);
						console.warn(`[Create Bedrock] Ignored invalid train ${train?.id ?? "unknown"}: ${error}`);
					}
				}
			} catch (error) {
				console.warn(`[Create Bedrock] Ignored invalid train dimension ${dimension?.dimensionId ?? "unknown"}: ${error}`);
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
		if (graph.getNode(adjacentId)) {
			const points = y === 0 && x !== 0 && z !== 0 ? curvePoints(block.location, adjacent) : undefined;
			graph.connect(id, adjacentId, Math.hypot(x, y, z), points);
		}
	}
	persist();
}

function refreshTrackAvailability() {
	for (const [dimensionId, graph] of graphs) {
		const dimension = world.getDimension(dimensionId);
		for (const node of graph.getNodes()) {
			let available = false;
			try {
				available = dimension.getBlock(node.location)?.typeId === TRACK_BLOCK;
			} catch {
				available = false;
			}
			graph.setNodeAvailable(node.id, available);
		}
	}
}

function createTrain(dimensionId, nodeIdValue) {
	const id = `train:${nextTrainId++}`;
	const controller = controllerFor(dimensionId);
	controller.registerTrain({ carriageCount: 2, carriageSpacing: 2, id, nodeId: nodeIdValue });
	trains.set(id, {
		dimensionId,
		entityIds: spawnCarriageMarkers(dimensionId, id, controller)
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
	const result = controller.dispatchWithReason(trainId, destinationId);
	if (result.ok)
		persist();
	else
		player.sendMessage(`Train dispatch unavailable: ${result.reason}.`);
}

function trackNodeForStation(block) {
	const graph = graphFor(block.dimension.id);
	for (const [x, y, z] of STATION_TRACK_OFFSETS) {
		const candidate = nodeId({ x: block.location.x + x, y: block.location.y + y, z: block.location.z + z });
		if (graph.getNode(candidate))
			return candidate;
	}
	return undefined;
}

function selectStationLoop(player, dimensionId, stationNodeId) {
	const selection = selections.get(player.id);
	if (!selection) {
		selections.set(player.id, { dimensionId, nodeId: stationNodeId, station: true });
		return;
	}
	selections.delete(player.id);
	if (!selection.station || selection.dimensionId !== dimensionId || selection.nodeId === stationNodeId)
		return;

	const controller = controllerFor(dimensionId);
	let trainId = [...trains.entries()]
		.find(([id, train]) => train.dimensionId === dimensionId && controller.getTrain(id).nodeId === selection.nodeId && !controller.getTrain(id).destinationId)?.[0];
	if (!trainId)
		trainId = createTrain(dimensionId, selection.nodeId);
	const result = controller.setScheduleWithReason(trainId, { dwellTicks: 20, stopIds: [stationNodeId, selection.nodeId] });
	if (result.ok) {
		persist();
		if (result.state === "waiting")
			player.sendMessage("Train loop armed and waiting for a usable route.");
	} else
		player.sendMessage(`Train loop unavailable: ${result.reason}.`);
}

function toggleStationStop(player, dimensionId, stationNodeId) {
	const controller = controllerFor(dimensionId);
	const trainId = [...trains.entries()]
		.filter(([id, train]) => train.dimensionId === dimensionId && controller.getTrain(id).nodeId === stationNodeId)
		.map(([id]) => id)
		.sort()[0];
	if (!trainId) {
		player.sendMessage("No train is available at this station.");
		return;
	}

	const motion = controller.getMotionState(trainId);
	if (motion.blockedReason) {
		player.sendMessage(`Train is frozen: ${motion.blockedReason}. Clear the obstruction first.`);
		return;
	}
	if (controller.setStopped(trainId, !motion.stopped)) {
		persist();
		player.sendMessage(motion.stopped ? "Train released." : "Train stopped.");
	}
}

function updateTrainCollision(dimensionId, id, controller, carriages) {
	const dimension = world.getDimension(dimensionId);
	const collision = findTrainCollision(carriages, location => {
		try {
			return dimension.getBlock(location);
		} catch {
			return { typeId: "createbedrock:unavailable_collision_space" };
		}
	});
	const motion = controller.getMotionState(id);
	if (collision) {
		const reason = `${collision.reason}:${collision.location.x}:${collision.location.y}:${collision.location.z}`;
		if (controller.setBlocked(id, reason)) {
			console.warn(`[Create Bedrock] Train ${id} frozen: ${reason}`);
			persist();
		}
		return;
	}
	if (motion.blockedReason?.startsWith("world_blocked:") && controller.setBlocked(id)) {
		console.warn(`[Create Bedrock] Train ${id} collision cleared`);
		persist();
	}
}

function tickTrains() {
	ticksSinceAvailabilityCheck++;
	if (ticksSinceAvailabilityCheck >= 20) {
		ticksSinceAvailabilityCheck = 0;
		refreshTrackAvailability();
	}
	for (const [id, train] of trains) {
		const controller = controllerFor(train.dimensionId);
		controller.tick(id);
		const carriages = controller.getCarriagePlacements(id);
		updateTrainCollision(train.dimensionId, id, controller, carriages);
		train.entityIds = carriages.map(carriage => {
			let entity = world.getEntity(train.entityIds?.[carriage.index]);
			if (!entity?.isValid) {
				const entityId = spawnCarriageMarker(train.dimensionId, id, carriage.index, locationForCarriage(train.dimensionId, carriage));
				entity = world.getEntity(entityId);
				return entityId;
			}
			entity.teleport(markerLocation(locationForCarriage(train.dimensionId, carriage)));
			return entity.id;
		});
	}

	ticksSincePersist++;
	if (ticksSincePersist >= 20) {
		ticksSincePersist = 0;
		persist();
	}
}

export function registerTrains() {
	registerKernelTaskGroup("trains", 1);
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
		if (event.block.typeId === STATION_BLOCK) {
			const stationNodeId = trackNodeForStation(event.block);
			if (!stationNodeId) {
				event.player.sendMessage("Station requires an adjacent track.");
				return;
			}
			if (event.player.isSneaking)
				toggleStationStop(event.player, event.block.dimension.id, stationNodeId);
			else
				selectStationLoop(event.player, event.block.dimension.id, stationNodeId);
		}
	});

	registerTickHandler(tickTrains, "trains");
	system.run(restore);
}

export function getTrainDiagnostics() {
	const blockedReasons = {};
	for (const [id, train] of trains) {
		const reason = controllerFor(train.dimensionId).getMotionState(id).blockedReason;
		if (reason)
			blockedReasons[id] = reason;
	}
	let edges = 0;
	let nodes = 0;
	for (const graph of graphs.values()) {
		const snapshot = graph.snapshot();
		for (const chunk of snapshot.chunks) {
			edges += chunk.edges.length;
			nodes += chunk.nodes.length;
		}
	}
	return {
		blocked: Object.keys(blockedReasons).length,
		blockedReasons,
		dimensions: graphs.size,
		edges,
		markers: [...trains.values()].reduce((total, train) => total + train.entityIds.length, 0),
		nodes,
		trains: trains.size
	};
}
