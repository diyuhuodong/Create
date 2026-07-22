import { system, world } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";

import { enqueueUniqueKernelTask, registerKernelTaskGroup, registerTickHandler } from "../kernel/index.js";
import { ShardedStateStore } from "../kernel/sharded-state-store.js";
import { deserializeVersionedState } from "../kernel/versioned-state.js";
import { deliverTrainPackages, getTrainPackageCargoState, retrieveTrainPackages } from "../logistics/package-runtime.js";
import { PortalTrackTransferAuthority } from "./portal-track-transfer.js";
import { migrateLegacySchedule } from "./schedule-ast.js";
import { openScheduleFormSession, submitScheduleFormIntent } from "./schedule-form-runtime.js";
import { TrackGraph } from "./track-graph.js";
import { createBezierTrackGeometry } from "./track-geometry.js";
import { createTrainAuthorityRecords, migrateLegacyTrainSnapshot, readTrainAuthorityRecords, trainAuthorityPartition } from "./train-authority-state.js";
import { findTrainCollision } from "./train-collision.js";
import { appendScheduleStop, readScheduleItemState, SCHEDULE_ITEM, writeScheduleItemState } from "./schedule-item-state.js";
import { TrainController } from "./train-controller.js";
import { createTrainFormation } from "./train-formation.js";
import { applyTrainRecoveryPlan, planTrainRecovery } from "./train-recovery.js";
import { TrainStationRegistry } from "./train-station-registry.js";

const TRACK_BLOCK = "createbedrock:track";
const STATION_BLOCK = "createbedrock:track_station";
const CONTROLLER_RAIL_BLOCK = "createbedrock:controller_rail";
const TRAIN_ENTITY = "createbedrock:train";
const TRAIN_ID_PROPERTY = "createbedrock:train_id";
const TRAIN_CARRIAGE_INDEX_PROPERTY = "createbedrock:train_carriage_index";
const TRAIN_TASK_BUDGET = 4;
const LEGACY_PERSISTENCE_KEY = "createbedrock:trains_v1";
const LEGACY_PERSISTENCE_SCHEMA_VERSION = 1;
const TRACK_CONNECTION_OFFSETS = [
	[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
	[1, 0, 1], [1, 0, -1], [-1, 0, 1], [-1, 0, -1],
	[1, 1, 0], [1, -1, 0], [-1, 1, 0], [-1, -1, 0],
	[0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]
];
const STATION_TRACK_OFFSETS = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
const graphs = new Map();
const controllers = new Map();
const stationRegistries = new Map();
const trains = new Map();
const selections = new Map();
let portalTransferAuthority;
let redstoneLinkResolver = () => false;
let nextTrainId = 1;
let ticksSinceAvailabilityCheck = 0;
const authorityStore = new ShardedStateStore({
	keyPrefix: "createbedrock:train_authority_v2",
	onError(error) {
		console.warn(`[Create Bedrock] Could not persist train authority state: ${error}`);
	},
	partitionFor: trainAuthorityPartition,
	storage: {
		delete(key) { world.setDynamicProperty(key, undefined); },
		get(key) { return world.getDynamicProperty(key); },
		set(key, value) { world.setDynamicProperty(key, value); }
	},
	writesPerTick: 2
});

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

function stationRegistryFor(dimensionId) {
	let registry = stationRegistries.get(dimensionId);
	if (!registry) {
		registry = new TrainStationRegistry(dimensionId);
		stationRegistries.set(dimensionId, registry);
	}
	return registry;
}

function stationPower(dimensionId, nodeIdValue) {
	const station = stationRegistryFor(dimensionId).findByNode(nodeIdValue);
	if (!station)
		return false;
	try {
		const states = world.getDimension(dimensionId).getBlock(station.location)?.permutation?.getAllStates?.() ?? {};
		return !!(states["createbedrock:powered"] ?? states["minecraft:powered_bit"] ?? (states["createbedrock:signal"] ?? 0) > 0);
	} catch {
		return station.powered;
	}
}

function controllerFor(dimensionId) {
	let controller = controllers.get(dimensionId);
	if (!controller) {
		controller = new TrainController(graphFor(dimensionId), {
			scheduleEnvironment: {
				cargoEmpty(trainId) { return getTrainPackageCargoState(trainId).empty; },
				cargoIdleTicks(trainId) { return getTrainPackageCargoState(trainId).idleTicks; },
				deliverPackages(trainId, address) { return deliverTrainPackages(trainId, dimensionId, address); },
				itemCount(trainId, filter) { return getTrainPackageCargoState(trainId).itemCounts[filter] ?? 0; },
				redstoneLinkPowered(trainId, frequencyA, frequencyB) {
					const node = graphFor(dimensionId).getNode(controllers.get(dimensionId)?.getTrain(trainId).nodeId);
					return redstoneLinkResolver(dimensionId, [frequencyA, frequencyB], node?.location) > 0;
				},
				resolveDestination(_trainId, filter, exact) { return stationRegistryFor(dimensionId).resolve(filter, exact); },
				retrievePackages(trainId, address) { return retrieveTrainPackages(trainId, dimensionId, address); },
				stationPowered(trainId) { return stationPower(dimensionId, controllers.get(dimensionId)?.getTrain(trainId).nodeId); },
				timeOfDay() { return Number(world.getAbsoluteTime?.() ?? world.getTimeOfDay?.() ?? 0); }
			}
		});
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

function markerRotation(tangent = { x: 1, y: 0, z: 0 }) {
	const horizontal = Math.hypot(tangent.x, tangent.z);
	return {
		x: -Math.atan2(tangent.y, horizontal) * 180 / Math.PI,
		y: Math.atan2(-tangent.x, tangent.z) * 180 / Math.PI
	};
}

function curvePoints(from, to) {
	return createBezierTrackGeometry({
		control1: { x: to.x, y: from.y + (to.y - from.y) / 3, z: from.z },
		control2: { x: to.x, y: from.y + (to.y - from.y) * 2 / 3, z: from.z },
		end: to,
		start: from
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

function spawnCarriageMarker(dimensionId, trainId, carriageIndex, location, tangent) {
	const dimension = world.getDimension(dimensionId);
	const existing = dimension.getEntities({ type: TRAIN_ENTITY })
		.find(entity => entity.getDynamicProperty(TRAIN_ID_PROPERTY) === trainId
			&& entity.getDynamicProperty(TRAIN_CARRIAGE_INDEX_PROPERTY) === carriageIndex);
	if (existing?.isValid) {
		existing.teleport(markerLocation(location));
		existing.setRotation(markerRotation(tangent));
		return existing.id;
	}

	const entity = dimension.spawnEntity(TRAIN_ENTITY, markerLocation(location));
	entity.setDynamicProperty(TRAIN_ID_PROPERTY, trainId);
	entity.setDynamicProperty(TRAIN_CARRIAGE_INDEX_PROPERTY, carriageIndex);
	entity.setRotation(markerRotation(tangent));
	return entity.id;
}

function spawnCarriageMarkers(dimensionId, trainId, controller) {
	return controller.getCarriageFrames(trainId).map(carriage => spawnCarriageMarker(
		dimensionId,
		trainId,
		carriage.index,
		locationForCarriage(dimensionId, carriage),
		carriage.tangent
	));
}

function portalTransfers() {
	if (portalTransferAuthority)
		return portalTransferAuthority;
	portalTransferAuthority = new PortalTrackTransferAuthority({
		checkpoint() { persist(); },
		complete() { persist(); },
		rebuildProjection(record) {
			const controller = controllerFor(record.destination.dimensionId);
			if (!controller.hasTrain(record.trainId))
				return false;
			const current = trains.get(record.trainId) ?? {};
			const entityIds = spawnCarriageMarkers(record.destination.dimensionId, record.trainId, controller);
			trains.set(record.trainId, {
				dimensionId: record.destination.dimensionId,
				entityIds,
				sourceEntityIds: current.sourceEntityIds ?? record.payload?.sourceEntityIds ?? []
			});
			return true;
		},
		releaseEntrance(record) {
			const metadata = trains.get(record.trainId);
			for (const entityId of metadata?.sourceEntityIds ?? record.payload?.sourceEntityIds ?? []) {
				try { world.getEntity(entityId)?.remove(); } catch {}
			}
			if (metadata)
				delete metadata.sourceEntityIds;
			return true;
		},
		reserveDestination(record) {
			return !!graphFor(record.destination.dimensionId).getNode(record.destination.nodeId)
				&& !controllerFor(record.destination.dimensionId).hasTrain(record.trainId);
		},
		switchAuthority(record) {
			const source = controllerFor(record.source.dimensionId);
			const destination = controllerFor(record.destination.dimensionId);
			if (destination.hasTrain(record.trainId))
				return true;
			const trainRecord = record.payload?.trainRecord;
			if (!trainRecord)
				return false;
			if (source.hasTrain(record.trainId))
				source.removeTrain(record.trainId);
			destination.restore([{
				...trainRecord,
				blockedReason: undefined,
				distanceOnEdge: 0,
				edgeIndex: 0,
				nodeId: record.destination.nodeId,
				route: undefined,
				stopped: false
			}]);
			const current = trains.get(record.trainId) ?? {};
			trains.set(record.trainId, { ...current, dimensionId: record.destination.dimensionId, sourceEntityIds: record.payload.sourceEntityIds ?? [] });
			return true;
		}
	});
	return portalTransferAuthority;
}

function persist() {
	try {
		authorityStore.request(createTrainAuthorityRecords({
			dimensions: [...graphs.keys()].sort().map(dimensionId => ({
				dimensionId,
				graph: graphFor(dimensionId).snapshot(),
				stations: stationRegistryFor(dimensionId).snapshot(),
				trains: controllerFor(dimensionId).snapshot()
			})),
			nextTrainId,
			portalTransfers: portalTransferAuthority?.snapshot() ?? []
		}));
	} catch (error) {
		console.warn(`[Create Bedrock] Could not queue train authority state: ${error}`);
	}
}

function restoreAuthoritySnapshot(snapshot) {
	nextTrainId = snapshot.nextTrainId;
	for (const dimension of snapshot.dimensions) {
		try {
			const graph = graphFor(dimension.dimensionId);
			graph.restore(dimension.graph);
			stationRegistryFor(dimension.dimensionId).restore(dimension.stations ?? []);
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
	portalTransfers().restore(snapshot.portalTransfers ?? []);
}

function restoreLegacyAuthority() {
	const serialized = world.getDynamicProperty(LEGACY_PERSISTENCE_KEY);
	if (typeof serialized !== "string")
		return false;

	try {
		const snapshot = deserializeVersionedState(serialized, {
			schemaVersion: LEGACY_PERSISTENCE_SCHEMA_VERSION,
			upgrades: {
				0: legacy => legacy
			}
		});
		restoreAuthoritySnapshot(migrateLegacyTrainSnapshot(snapshot));
		persist();
		return true;
	} catch (error) {
		console.warn(`[Create Bedrock] Ignored invalid train state: ${error}`);
		return false;
	}
}

function restore() {
	try {
		const restored = authorityStore.read();
		if (restored) {
			const snapshot = readTrainAuthorityRecords(restored.records);
			restoreAuthoritySnapshot(snapshot);
			for (const warning of restored.warnings)
				console.warn(`[Create Bedrock] Ignored corrupt train authority shard ${warning.partition}: ${warning.error}`);
			return;
		}
	} catch (error) {
		console.warn(`[Create Bedrock] Train authority state is invalid and will not be guessed: ${error}`);
		return;
	}
	restoreLegacyAuthority();
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
	for (const [x, y, z] of STATION_TRACK_OFFSETS) {
		try {
			const station = block.dimension.getBlock({ x: block.location.x + x, y: block.location.y + y, z: block.location.z + z });
			if (station?.typeId === STATION_BLOCK)
				ensureStation(station, id);
		} catch {}
	}
	persist();
}

function refreshTrackAvailability() {
	for (const [dimensionId, graph] of graphs) {
		const dimension = world.getDimension(dimensionId);
		for (const node of graph.getNodes()) {
			try {
				const block = dimension.getBlock(node.location);
				if (!block) {
					graph.setChunkAvailable(node.location, false);
					continue;
				}
				graph.setChunkAvailable(node.location, true);
				graph.setNodeAvailable(node.id, block.typeId === TRACK_BLOCK);
			} catch {
				graph.setChunkAvailable(node.location, false);
			}
		}
	}
}

function createTrain(dimensionId, nodeIdValue) {
	const id = `train:${nextTrainId++}`;
	const controller = controllerFor(dimensionId);
	controller.registerTrain({
		formation: createTrainFormation({ carriages: Array.from({ length: 2 }, (_, index) => ({
			doors: [{ id: `door:${index}:left`, side: "left" }, { id: `door:${index}:right`, side: "right" }],
			id: `carriage:${index}`,
			length: 2,
			seats: [
				{ id: `seat:${index}:0`, offset: { x: -.25, y: .5, z: 0 } },
				{ id: `seat:${index}:1`, offset: { x: .25, y: .5, z: 0 } }
			]
		})) }),
		id,
		nodeId: nodeIdValue
	});
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
		if (graph.getNode(candidate)) {
			ensureStation(block, candidate);
			return candidate;
		}
	}
	return undefined;
}

function stationId(block) {
	return `station:${block.dimension.id}:${nodeId(block.location)}`;
}

function ensureStation(block, stationNodeId) {
	if (block?.typeId !== STATION_BLOCK || !stationNodeId)
		return undefined;
	const id = stationId(block);
	const existing = stationRegistryFor(block.dimension.id).get(id);
	const result = stationRegistryFor(block.dimension.id).upsert({
		id,
		location: { ...block.location },
		name: existing?.name ?? `Station ${block.location.x},${block.location.y},${block.location.z}`,
		nodeId: stationNodeId,
		platformSide: existing?.platformSide ?? "right",
		powered: stationPower(block.dimension.id, stationNodeId)
	}, existing?.revision);
	if (result.changed)
		persist();
	return result.station;
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
	const result = controller.setScheduleAstWithReason(trainId, migrateLegacySchedule({ dwellTicks: 20, stopIds: [stationNodeId, selection.nodeId] }));
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

function replaceSelectedItem(player, itemStack) {
	const container = player?.getComponent?.("minecraft:inventory")?.container;
	if (!container || !Number.isInteger(player.selectedSlotIndex) || player.selectedSlotIndex < 0)
		return false;
	container.setItem(player.selectedSlotIndex, itemStack);
	return true;
}

function configureScheduleAtStation(player, itemStack, dimensionId, stationNodeId) {
	let schedule;
	try {
		schedule = readScheduleItemState(itemStack);
	} catch (error) {
		player.sendMessage?.(`Invalid Schedule: ${error}`);
		return true;
	}
	if (player.isSneaking) {
		const appended = appendScheduleStop(schedule, stationNodeId);
		if (!appended.changed) {
			player.sendMessage?.("This station is already in the Schedule.");
			return true;
		}
		writeScheduleItemState(itemStack, appended.state);
		replaceSelectedItem(player, itemStack);
		player.sendMessage?.(`Added stop ${appended.state.stopIds.length}/${16} to Schedule.`);
		return true;
	}
	if (schedule.stopIds.length === 0) {
		player.sendMessage?.("Sneak-use the Schedule on each Track Station to add stops first.");
		return true;
	}
	const controller = controllerFor(dimensionId);
	const trainId = [...trains.entries()]
		.filter(([id, train]) => train.dimensionId === dimensionId && controller.getTrain(id).nodeId === stationNodeId && !controller.getTrain(id).destinationId)
		.map(([id]) => id).sort()[0];
	if (!trainId) {
		player.sendMessage?.("No idle train is present at this station.");
		return true;
	}
	const result = controller.setScheduleAstWithReason(trainId, schedule.schedule);
	if (result.ok) {
		persist();
		player.sendMessage?.(schedule.cyclic ? "Cyclic Schedule assigned." : "One-way Schedule assigned.");
	} else
		player.sendMessage?.(`Schedule unavailable: ${result.reason}.`);
	return true;
}

function openHeldScheduleEditor(player, itemStack) {
	let opened;
	try {
		opened = readScheduleItemState(itemStack);
	} catch (error) {
		player.sendMessage?.(`Invalid Schedule: ${error}`);
		return;
	}
	const subjectId = `schedule:item:${String(player.id).toLowerCase().replace(/[^a-z0-9_.:/-]/g, "_")}`;
	const session = openScheduleFormSession(opened, subjectId);
	new ModalFormData()
		.title("Train Schedule")
		.toggle("Repeat Schedule", { defaultValue: opened.cyclic })
		.textField("Entries (validated JSON)", "[]", { defaultValue: JSON.stringify(opened.schedule.entries) })
		.textField("Resume entry", "0", { defaultValue: String(opened.schedule.savedProgress) })
		.submitButton("Save Schedule")
		.show(player).then(response => {
			if (response.canceled)
				return;
			const container = player?.getComponent?.("minecraft:inventory")?.container;
			const currentItem = container?.getItem(player.selectedSlotIndex);
			if (currentItem?.typeId !== SCHEDULE_ITEM) {
				player.sendMessage?.("The Schedule is no longer in the selected slot.");
				return;
			}
			const current = readScheduleItemState(currentItem);
			const entries = JSON.parse(String(response.formValues?.[1] ?? "[]"));
			const savedProgress = Number(response.formValues?.[2] ?? 0);
			const result = submitScheduleFormIntent({
				currentState: current,
				intent: { cyclic: response.formValues?.[0] === true, entries, savedProgress, type: "replace_schedule" },
				session
			});
			if (result.conflict) {
				player.sendMessage?.("This Schedule changed while the form was open; reopen it and try again.");
				return;
			}
			if (result.changed) {
				writeScheduleItemState(currentItem, result.state);
				replaceSelectedItem(player, currentItem);
				player.sendMessage?.("Schedule updated.");
			}
		}).catch(error => player.sendMessage?.(`Could not edit Schedule: ${error}`));
}

function updateTrainCollision(dimensionId, id, controller, carriages, ignoredEntityIds) {
	const dimension = world.getDimension(dimensionId);
	const collision = findTrainCollision(carriages, location => {
		try {
			return dimension.getBlock(location);
		} catch {
			return { typeId: "createbedrock:unavailable_collision_space" };
		}
	}, {
		ignoredEntityIds,
		readEntities(location) {
			const options = { location: markerLocation(location), maxDistance: 0.75 };
			try {
				return [...dimension.getEntities(options), ...dimension.getPlayers(options)];
			} catch {
				return [{ id: "unavailable_collision_entity" }];
			}
		}
	});
	const motion = controller.getMotionState(id);
	if (collision) {
		const suffix = collision.entityId ?? `${collision.location.x}:${collision.location.y}:${collision.location.z}`;
		const reason = `${collision.reason}:${suffix}`;
		if (controller.setBlocked(id, reason)) {
			console.warn(`[Create Bedrock] Train ${id} frozen: ${reason}`);
			persist();
		}
		return true;
	}
	if ((motion.blockedReason?.startsWith("world_blocked:") || motion.blockedReason?.startsWith("entity_blocked:")) && controller.setBlocked(id)) {
		console.warn(`[Create Bedrock] Train ${id} collision cleared`);
		persist();
	}
	return false;
}

function processTrain(id) {
	const train = trains.get(id);
	if (!train)
		return;

	const controller = controllerFor(train.dimensionId);
	// A zero-distance pass advances station schedules without moving.  The
	// following projection then checks the exact formation before committing
	// the tick, so collision state never advances into an occupied space.
	controller.tick(id, 0);
	const planned = controller.getProjectedCarriagePlacements(id);
	const routeState = controller.getTrain(id);
	if ((routeState.edgeId || routeState.settling)
		&& !updateTrainCollision(train.dimensionId, id, controller, planned, new Set(train.entityIds)))
		controller.tick(id);
	const current = controller.getTrain(id);
	const station = !current.destinationId && stationRegistryFor(train.dimensionId).findByNode(current.nodeId);
	controller.setPlatformDoors(id, station?.platformSide);
	const carriages = controller.getCarriageFrames(id);
	train.entityIds = carriages.map(carriage => {
		let entity = world.getEntity(train.entityIds?.[carriage.index]);
		if (!entity?.isValid) {
			const entityId = spawnCarriageMarker(train.dimensionId, id, carriage.index, locationForCarriage(train.dimensionId, carriage), carriage.tangent);
			entity = world.getEntity(entityId);
			return entityId;
		}
		entity.teleport(markerLocation(locationForCarriage(train.dimensionId, carriage)));
		entity.setRotation(markerRotation(carriage.tangent));
		return entity.id;
	});
}

function recoverTrainRuntime() {
	for (const [dimensionId, controller] of controllers) {
		let entities = [];
		try { entities = world.getDimension(dimensionId).getEntities({ type: TRAIN_ENTITY }); } catch {}
		const validCounts = new Map();
		for (const entity of entities) {
			const trainId = entity.getDynamicProperty(TRAIN_ID_PROPERTY);
			if (typeof trainId === "string")
				validCounts.set(trainId, (validCounts.get(trainId) ?? 0) + 1);
		}
		const authorityRecords = controller.snapshot();
		const projectionTrainIds = [...validCounts].filter(([trainId, count]) => controller.hasTrain(trainId) && count >= controller.getFormation(trainId).carriages.length).map(([trainId]) => trainId)
			.concat([...validCounts.keys()].filter(trainId => !controller.hasTrain(trainId)));
		const occupancyByTrain = Object.fromEntries(authorityRecords.map(record => [record.id, controller.getOccupancy(record.id)]));
		const plan = planTrainRecovery({
			authorityRecords,
			graphRevision: graphFor(dimensionId).getRevision(),
			occupancyByTrain,
			portalTransfers: portalTransfers().snapshot().filter(record => record.destination.dimensionId === dimensionId),
			projectionTrainIds
		});
		const results = applyTrainRecoveryPlan(plan, {
			freeze(trainId, reason) { return controller.setBlocked(trainId, reason); },
			rebuildProjection(trainId) {
				try {
					const metadata = trains.get(trainId);
					if (!metadata)
						return false;
					metadata.entityIds = spawnCarriageMarkers(dimensionId, trainId, controller);
					return true;
				} catch { return false; }
			},
			removeOrphanProjection(trainId) {
				let changed = false;
				for (const entity of entities)
					if (entity.getDynamicProperty(TRAIN_ID_PROPERTY) === trainId) {
						try { entity.remove(); changed = true; } catch {}
					}
				return changed;
			},
			retryPortal(transferId) { return portalTransfers().retry(transferId).ok; }
		});
		if (results.some(result => result.ok))
			persist();
	}
}

function tickTrains() {
	ticksSinceAvailabilityCheck++;
	if (ticksSinceAvailabilityCheck >= 20) {
		ticksSinceAvailabilityCheck = 0;
		refreshTrackAvailability();
		recoverTrainRuntime();
	}
	const pendingTransfers = portalTransfers().snapshot();
	for (const transfer of pendingTransfers)
		if (transfer.phase !== "frozen")
			portalTransfers().advance(transfer.id);
	const transferringTrainIds = new Set(portalTransfers().snapshot().map(transfer => transfer.trainId));
	for (const id of trains.keys())
		if (!transferringTrainIds.has(id))
			enqueueUniqueKernelTask(`train:${id}`, () => processTrain(id), "trains");

	if (trains.size > 0)
		persist();
	authorityStore.tick();
}

export function registerTrains() {
	registerKernelTaskGroup("trains", TRAIN_TASK_BUDGET);
	world.afterEvents.playerPlaceBlock.subscribe(event => {
		if (event.block.typeId === TRACK_BLOCK)
			addTrack(event.block);
		if (event.block.typeId === STATION_BLOCK)
			trackNodeForStation(event.block);
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
		const registry = stationRegistries.get(event.dimension.id);
		let changed = false;
		for (const station of registry?.snapshot() ?? [])
			if (station.location.x === event.block.location.x && station.location.y === event.block.location.y && station.location.z === event.block.location.z)
				changed = registry.remove(station.id, station.revision) || changed;
		const graph = graphs.get(event.dimension.id);
		if (!graph) {
			if (changed)
				persist();
			return;
		}
		try {
			if (graph.removeNode(nodeId(event.block.location)) || changed)
				persist();
		} catch (error) {
			console.warn(`[Create Bedrock] Track removal deferred: ${error}`);
		}
	});

	world.afterEvents.playerInteractWithBlock.subscribe(event => {
		if (event.block.typeId === TRACK_BLOCK)
			selectRoute(event.player, event.block.dimension.id, nodeId(event.block.location));
		if (event.block.typeId === CONTROLLER_RAIL_BLOCK && event.itemStack?.typeId === SCHEDULE_ITEM && event.player.isSneaking) {
			openHeldScheduleEditor(event.player, event.itemStack);
			return;
		}
		if (event.block.typeId === STATION_BLOCK) {
			const stationNodeId = trackNodeForStation(event.block);
			if (!stationNodeId) {
				event.player.sendMessage("Station requires an adjacent track.");
				return;
			}
			if (event.itemStack?.typeId === SCHEDULE_ITEM) {
				configureScheduleAtStation(event.player, event.itemStack, event.block.dimension.id, stationNodeId);
				return;
			}
			if (event.player.isSneaking)
				toggleStationStop(event.player, event.block.dimension.id, stationNodeId);
			else
				selectStationLoop(event.player, event.block.dimension.id, stationNodeId);
		}
	});
	world.afterEvents.playerInteractWithEntity?.subscribe(event => {
		const entity = event.target;
		if (entity?.typeId !== TRAIN_ENTITY)
			return;
		const trainId = entity.getDynamicProperty(TRAIN_ID_PROPERTY);
		const carriageIndex = entity.getDynamicProperty(TRAIN_CARRIAGE_INDEX_PROPERTY);
		const metadata = trains.get(trainId);
		if (!metadata || !Number.isInteger(carriageIndex))
			return;
		const controller = controllerFor(metadata.dimensionId);
		const carriage = controller.getFormation(trainId).carriages[carriageIndex];
		if (!carriage)
			return;
		const occupied = carriage.seats.find(seat => seat.passengerId === event.player.id);
		const rideable = entity.getComponent?.("minecraft:rideable");
		if (occupied && event.player.isSneaking) {
			try { rideable?.ejectRider?.(event.player); } catch {}
			if (controller.releasePassenger(trainId, event.player.id))
				persist();
			return;
		}
		if (occupied)
			return;
		const seat = carriage.seats.find(candidate => !candidate.passengerId);
		if (!seat) {
			event.player.sendMessage?.("This carriage has no free seats.");
			return;
		}
		try {
			controller.bindPassenger(trainId, { carriageId: carriage.id, passengerId: event.player.id, seatId: seat.id });
			if (rideable?.addRider?.(event.player) === false)
				controller.releasePassenger(trainId, event.player.id);
			else
				persist();
		} catch (error) {
			controller.releasePassenger(trainId, event.player.id);
			event.player.sendMessage?.(`Could not board train: ${error}`);
		}
	});

	registerTickHandler(tickTrains);
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
	let chunks = 0;
	let loadedChunks = 0;
	let nodes = 0;
	for (const graph of graphs.values()) {
		const diagnostics = graph.getChunkDiagnostics();
		chunks += diagnostics.chunks;
		loadedChunks += diagnostics.loadedChunks;
		const snapshot = graph.snapshot();
		for (const chunk of snapshot.chunks) {
			edges += chunk.edges.length;
			nodes += chunk.nodes.length;
		}
	}
	return {
		blocked: Object.keys(blockedReasons).length,
		blockedReasons,
		chunks,
		dimensions: graphs.size,
		edges,
		loadedChunks,
		markers: [...trains.values()].reduce((total, train) => total + train.entityIds.length, 0),
		nodes,
		persistence: authorityStore.diagnostics(),
		portalTransfers: portalTransfers().snapshot().length,
		stations: [...stationRegistries.values()].reduce((total, registry) => total + registry.snapshot().length, 0),
		trains: trains.size
	};
}

export function getTrainDisplayState(dimensionId) {
	const controller = controllers.get(dimensionId);
	const records = [...trains.entries()]
		.filter(([, train]) => train.dimensionId === dimensionId)
		.map(([id]) => {
			const route = controller?.getTrain(id);
			const motion = controller?.getMotionState(id);
			const schedule = controller?.getScheduleRuntime(id);
			const station = route && stationRegistryFor(dimensionId).findByNode(route.nodeId);
			return {
				blockedReason: motion?.blockedReason ?? "",
				destination: route?.destinationId ?? "",
				id,
				name: route?.name ?? id,
				nextDepartureTicks: schedule?.predictionTicks?.[schedule.currentEntry] ?? -1,
				scheduleState: schedule?.state ?? "manual",
				station: station?.name ?? "",
				stopped: motion?.stopped === true
			};
		})
		.sort((left, right) => left.id.localeCompare(right.id));
	return { trains: records };
}

/** Stage-5 control plane access: callers may observe and command the one
 * authoritative controller, but never create a second route reservation map. */
export function getTrainAuthority(dimensionId) {
	if (typeof dimensionId !== "string" || dimensionId.length === 0)
		throw new TypeError("Train authority requires a dimension identifier");
	const controller = controllerFor(dimensionId);
	return {
		controller,
		graph: graphFor(dimensionId),
		trainIds: [...trains.entries()].filter(([, train]) => train.dimensionId === dimensionId).map(([id]) => id).sort()
	};
}

export function persistTrainAuthority() {
	persist();
}

export function setTrainRedstoneLinkResolver(resolver) {
	if (typeof resolver !== "function")
		throw new TypeError("Train Redstone Link resolver must be a function");
	redstoneLinkResolver = resolver;
}

export function transferTrainThroughPortal(trainId, destinationDimensionId, destinationNodeId) {
	const metadata = trains.get(trainId);
	if (!metadata)
		return { ok: false, reason: "unknown_train" };
	const sourceController = controllerFor(metadata.dimensionId);
	const state = sourceController.getTrain(trainId);
	const motion = sourceController.getMotionState(trainId);
	if (state.destinationId || motion.blockedReason)
		return { ok: false, reason: "train_not_idle" };
	const destinationNode = graphFor(destinationDimensionId).getNode(destinationNodeId);
	const sourceNode = graphFor(metadata.dimensionId).getNode(state.nodeId);
	if (!destinationNode || !sourceNode)
		return { ok: false, reason: "portal_endpoint_unavailable" };
	if (portalTransfers().snapshot().some(record => record.trainId === trainId))
		return { ok: false, reason: "transfer_active" };
	const trainRecord = sourceController.snapshot().find(record => record.id === trainId);
	const wasStopped = motion.stopped;
	sourceController.setStopped(trainId, true);
	const result = portalTransfers().begin({
		destination: { dimensionId: destinationDimensionId, location: destinationNode.location, nodeId: destinationNodeId },
		id: `portal:${trainId}:${system.currentTick}`,
		payload: { sourceEntityIds: [...metadata.entityIds], trainRecord: { ...trainRecord, stopped: wasStopped } },
		source: { dimensionId: metadata.dimensionId, location: sourceNode.location, nodeId: state.nodeId },
		trainId
	});
	if (!result.ok)
		sourceController.setStopped(trainId, wasStopped);
	else
		persist();
	return result;
}

export function retryPortalTrainTransfer(transferId) {
	const result = portalTransfers().retry(transferId);
	if (result.ok)
		persist();
	return result;
}
