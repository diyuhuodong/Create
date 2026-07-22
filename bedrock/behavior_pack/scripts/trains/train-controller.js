import { bindFormationPassenger, createTrainFormation, normalizeTrainFormation, releaseFormationPassenger, setFormationDoors, trainCarriageLeadOffsets } from "./train-formation.js";
import { TrainOccupancyAuthority } from "./train-occupancy.js";
import { legacyScheduleView, migrateLegacySchedule, normalizeScheduleAst } from "./schedule-ast.js";
import { ScheduleRuntime, SCHEDULE_RUNTIME_STATE } from "./schedule-runtime.js";

export class TrainController {
	#graph;
	#occupancy;
	#scheduleEnvironment;
	#trains = new Map();

	constructor(trackGraph, { scheduleEnvironment = {} } = {}) {
		for (const method of ["findRoute", "getEdge", "getNode", "isEdgeAvailable", "releaseEdge", "releaseReservations", "sampleEdge", "tryReserve"]) {
			if (typeof trackGraph?.[method] !== "function")
				throw new TypeError(`TrainController track graph requires ${method}()`);
		}
		this.#graph = trackGraph;
		this.#occupancy = new TrainOccupancyAuthority({ graphRevision: trackGraph.getRevision?.() ?? 0 });
		this.#scheduleEnvironment = scheduleEnvironment;
	}

	registerTrain({ formation, id, nodeId, carriageCount = 1, carriageSpacing = 2, speed = 0.1 }) {
		if (!id || this.#trains.has(id))
			throw new Error("Train ids must be unique");
		if (!Number.isInteger(carriageCount) || carriageCount < 1 || !Number.isFinite(carriageSpacing) || carriageSpacing <= 0)
			throw new RangeError("Trains require at least one carriage and positive carriage spacing");
		if (!Number.isFinite(speed) || speed <= 0)
			throw new RangeError("Trains require a positive cruising speed");
		formation = formation ? normalizeTrainFormation(formation) : createTrainFormation({ carriageCount, carriageSpacing });
		carriageCount = formation.carriages.length;
		carriageSpacing = formation.carriages[0].length;
		this.#trains.set(id, {
			blockedReason: undefined,
			carriageCount,
			carriageSpacing,
			direction: 0,
			formation,
			id,
			name: id,
			nodeId,
			route: undefined,
			schedule: undefined,
			scheduleRuntime: undefined,
			edgeIndex: 0,
			distanceOnEdge: 0,
			cruisingSpeed: speed,
			speed: 0,
			stopped: false,
			targetSpeed: speed
		});
	}

	dispatch(id, destinationId) {
		return this.dispatchWithReason(id, destinationId).ok;
	}

	dispatchWithReason(id, destinationId) {
		const train = this.#requireTrain(id);
		if (train.route)
			return { ok: false, reason: "already_moving" };
		if (train.schedule || train.scheduleRuntime)
			return { ok: false, reason: "scheduled" };
		if (!this.#graph.getNode(destinationId))
			return { ok: false, reason: "unknown_destination" };

		return this.#startRoute(train, destinationId);
	}

	setSchedule(id, { cyclic = true, stopIds, dwellTicks = 20 }) {
		return this.setScheduleWithReason(id, { cyclic, stopIds, dwellTicks }).ok;
	}

	setScheduleWithReason(id, { cyclic = true, stopIds, dwellTicks = 20 }) {
		const train = this.#requireTrain(id);
		if (train.route)
			return { ok: false, reason: "already_moving" };
		if (!Array.isArray(stopIds) || stopIds.length === 0 || typeof cyclic !== "boolean" || !Number.isInteger(dwellTicks) || dwellTicks < 0)
			return { ok: false, reason: "invalid_schedule" };
		if (stopIds.some(stopId => !this.#graph.getNode(stopId)))
			return { ok: false, reason: "unknown_station" };

		train.schedule = {
			cyclic,
			dwellRemaining: 0,
			dwellTicks,
			nextStopIndex: 0,
			stopIds: [...stopIds]
		};
		train.scheduleRuntime = undefined;
		this.#advanceSchedule(train);
		return { ok: true, state: train.route ? "moving" : "waiting" };
	}

	setScheduleAst(id, schedule) {
		return this.setScheduleAstWithReason(id, schedule).ok;
	}

	setScheduleAstWithReason(id, schedule) {
		const train = this.#requireTrain(id);
		if (train.route)
			return { ok: false, reason: "already_moving" };
		try {
			schedule = normalizeScheduleAst(schedule?.schedule ?? schedule);
		} catch {
			return { ok: false, reason: "invalid_schedule" };
		}
		if (schedule.entries.length === 0)
			return { ok: false, reason: "invalid_schedule" };
		if (schedule.entries.some(entry => entry.instruction.type === "destination" && entry.instruction.exact && !this.#graph.getNode(entry.instruction.filter)))
			return { ok: false, reason: "unknown_station" };

		train.schedule = undefined;
		train.scheduleRuntime = new ScheduleRuntime(schedule);
		this.#advanceScheduleAst(train);
		return { ok: true, state: train.route ? "moving" : "waiting" };
	}

	setSchedulePaused(id, paused) {
		const train = this.#requireTrain(id);
		return train.scheduleRuntime?.setPaused(paused) ?? false;
	}

	clearSchedule(id) {
		const train = this.#requireTrain(id);
		if (train.route)
			return false;
		const hadSchedule = !!train.schedule || !!train.scheduleRuntime;
		train.schedule = undefined;
		train.scheduleRuntime = undefined;
		return hadSchedule;
	}

	tick(id, distance) {
		const train = this.#requireTrain(id);
		distance ??= train.targetSpeed;
		if (!Number.isFinite(distance) || distance < 0)
			throw new RangeError("Train movement distance must be non-negative");

		if (train.stopped || train.blockedReason) {
			train.speed = 0;
			return this.getTrain(id);
		}
		if (train.route && train.route.graphRevision !== (this.#graph.getRevision?.() ?? train.route.graphRevision)) {
			train.blockedReason = "graph_revision_changed";
			train.speed = 0;
			this.#occupancy.release(train.id);
			return this.getTrain(id);
		}
		if (!train.route) {
			if (train.scheduleRuntime)
				this.#advanceScheduleAst(train);
			else
				this.#advanceSchedule(train);
			if (!train.route || distance === 0) {
				train.speed = 0;
				return this.getTrain(id);
			}
		}
		if (distance === 0) {
			train.speed = 0;
			return this.getTrain(id);
		}
		const graphRevision = train.route.graphRevision;
		const projected = this.#projectTrain(train, distance);
		const claim = this.#occupancy.replace(train.id, this.#occupiedIntervalsFor(projected), {
			graphRevision,
			tokenId: `${train.id}:${graphRevision}:${train.edgeIndex}`
		});
		if (!claim.ok) {
			train.blockedReason = `occupancy_${claim.reason}`;
			train.speed = 0;
			return this.getTrain(id);
		}

		let remaining = distance;
		let movedDistance = 0;
		while (remaining > 0 && train.route) {
			if (train.edgeIndex === train.route.edgeIds.length) {
				const moved = Math.min(this.#tailDistance(train) - train.route.settlingDistance, remaining);
				train.route.settlingDistance += moved;
				remaining -= moved;
				movedDistance += moved;
				if (train.route.settlingDistance >= this.#tailDistance(train))
					this.#completeRoute(train);
				break;
			}
			const edgeId = train.route.edgeIds[train.edgeIndex];
			if (!train.route.reservedEdgeIds.has(edgeId)) {
				if (!this.#graph.tryReserve(train.id, [edgeId]))
					break;
				train.route.reservedEdgeIds.add(edgeId);
			}
			if (!this.#graph.isEdgeAvailable(edgeId))
				break;
			const edge = this.#graph.getEdge(edgeId);
			const available = edge.length - train.distanceOnEdge;
			const moved = Math.min(available, remaining);
			train.distanceOnEdge += moved;
			remaining -= moved;
			movedDistance += moved;

			if (train.distanceOnEdge < edge.length)
				break;

			train.nodeId = train.route.nodeIds[train.edgeIndex + 1];
			train.edgeIndex++;
			train.distanceOnEdge = 0;

			if (train.edgeIndex === train.route.edgeIds.length) {
				train.direction = 0;
				if (this.#tailDistance(train) === 0)
					this.#completeRoute(train);
			} else
				train.direction = this.#routeDirection(train);
		}
		if (train.route)
			this.#releaseClearedEdges(train);
		if (train.route)
			this.#occupancy.replace(train.id, this.#occupiedIntervalsFor(train), { graphRevision: train.route.graphRevision, tokenId: `${train.id}:${train.route.graphRevision}:${train.edgeIndex}` });
		else
			this.#occupancy.release(train.id);
		train.speed = train.route ? movedDistance : 0;

		return this.getTrain(id);
	}

	setStopped(id, stopped) {
		const train = this.#requireTrain(id);
		const normalized = !!stopped;
		if (train.stopped === normalized)
			return false;
		train.stopped = normalized;
		if (normalized)
			train.speed = 0;
		return true;
	}

	setTargetSpeed(id, speed) {
		if (!Number.isFinite(speed) || speed <= 0)
			throw new RangeError("Train target speed must be positive");
		const train = this.#requireTrain(id);
		if (train.targetSpeed === speed)
			return false;
		train.targetSpeed = speed;
		train.cruisingSpeed = speed;
		return true;
	}

	setBlocked(id, reason = undefined) {
		if (reason !== undefined && (typeof reason !== "string" || reason.length === 0))
			throw new TypeError("Train blocking reasons must be non-empty strings");
		const train = this.#requireTrain(id);
		if (train.blockedReason === reason)
			return false;
		train.blockedReason = reason;
		if (reason)
			train.speed = 0;
		return true;
	}

	removeTrain(id) {
		const train = this.#requireTrain(id);
		if (train.route)
			this.#graph.releaseReservations(id);
		this.#occupancy.release(id);
		this.#trains.delete(id);
		return true;
	}

	hasTrain(id) {
		return this.#trains.has(id);
	}

	getMotionState(id) {
		const train = this.#requireTrain(id);
		return {
			blockedReason: train.blockedReason,
			direction: train.direction,
			speed: train.speed,
			stopped: train.stopped,
			targetSpeed: train.targetSpeed
		};
	}

	getTrain(id) {
		const train = this.#requireTrain(id);
		const state = {
			id: train.id,
			nodeId: train.nodeId,
			edgeIndex: train.edgeIndex,
			distanceOnEdge: train.distanceOnEdge,
			destinationId: train.route?.nodeIds.at(-1)
		};
		if (train.name !== train.id)
			state.name = train.name;
		if (train.schedule) {
			state.schedule = {
				cyclic: train.schedule.cyclic,
				dwellRemaining: train.schedule.dwellRemaining,
				dwellTicks: train.schedule.dwellTicks,
				nextStopIndex: train.schedule.nextStopIndex,
				stopIds: [...train.schedule.stopIds]
			};
		}
		if (train.scheduleRuntime) {
			const runtime = train.scheduleRuntime.snapshot();
			state.scheduleAst = runtime.schedule;
			state.scheduleRuntime = {
				completed: runtime.completed,
				currentEntry: runtime.currentEntry,
				currentTitle: runtime.currentTitle,
				paused: runtime.paused,
				predictionTicks: runtime.predictionTicks,
				state: runtime.state
			};
			state.schedule = legacyScheduleView(runtime.schedule);
		}
		if (!train.route)
			return state;
		if (train.edgeIndex === train.route.edgeIds.length)
			return { ...state, settling: true };

		const edgeId = train.route.edgeIds[train.edgeIndex];
		const edge = this.#graph.getEdge(edgeId);
		return {
			...state,
			edgeId,
			fromNodeId: train.route.nodeIds[train.edgeIndex],
			toNodeId: train.route.nodeIds[train.edgeIndex + 1],
			edgeLength: edge.length,
			progress: train.distanceOnEdge / edge.length
		};
	}

	getCarriages(id) {
		const train = this.#requireTrain(id);
		return this.#carriagesFor(train);
	}

	getProjectedCarriagePlacements(id, distance = this.#requireTrain(id).targetSpeed) {
		if (!Number.isFinite(distance) || distance < 0)
			throw new RangeError("Projected train movement distance must be non-negative");
		return this.#carriagePlacementsFor(this.#projectTrain(this.#requireTrain(id), distance));
	}

	getCarriagePlacements(id) {
		return this.#carriagePlacementsFor(this.#requireTrain(id));
	}

	getFormation(id) {
		return normalizeTrainFormation(this.#requireTrain(id).formation);
	}

	bindPassenger(id, { carriageId, passengerId, seatId }) {
		const train = this.#requireTrain(id);
		train.formation = bindFormationPassenger(train.formation, { carriageId, passengerId, seatId });
		return this.getFormation(id);
	}

	releasePassenger(id, passengerId) {
		const train = this.#requireTrain(id);
		const result = releaseFormationPassenger(train.formation, passengerId);
		train.formation = result.formation;
		return result.changed;
	}

	setPlatformDoors(id, alignedSide = undefined) {
		const train = this.#requireTrain(id);
		const next = setFormationDoors(train.formation, { alignedSide, speed: train.speed });
		const changed = JSON.stringify(next) !== JSON.stringify(train.formation);
		train.formation = next;
		return changed;
	}

	getScheduleRuntime(id) {
		return this.#requireTrain(id).scheduleRuntime?.snapshot();
	}

	getOccupancy(id) {
		this.#requireTrain(id);
		return this.#occupancy.claimsFor(id);
	}

	getCarriageFrames(id) {
		const train = this.#requireTrain(id);
		const formation = normalizeTrainFormation(train.formation);
		return this.#carriagePlacementsFor(train).map((placement, index) => {
			let frame = { location: placement.location, normal: { x: 0, y: 1, z: 0 }, tangent: { x: 1, y: 0, z: 0 } };
			if (placement.fromNodeId) {
				const edgeId = [placement.fromNodeId, placement.toNodeId].sort().join("<->");
				frame = this.#graph.sampleEdgeFrame(edgeId, placement.fromNodeId, placement.progress);
			}
			return { ...placement, carriage: formation.carriages[index], ...frame };
		});
	}

	#carriagesFor(train) {
		if (!train.route) {
			return Array.from({ length: train.carriageCount }, (_, index) => ({
				index,
				nodeId: train.nodeId
			}));
		}

		let leadDistance = train.distanceOnEdge;
		for (let index = 0; index < train.edgeIndex; index++)
			leadDistance += this.#graph.getEdge(train.route.edgeIds[index]).length;
		leadDistance += train.route.settlingDistance;

		return trainCarriageLeadOffsets(train.formation).map(({ leadOffset }, index) => {
			let remaining = Math.max(0, leadDistance - leadOffset);
			for (let edgeIndex = 0; edgeIndex < train.route.edgeIds.length; edgeIndex++) {
				const edge = this.#graph.getEdge(train.route.edgeIds[edgeIndex]);
				if (remaining <= edge.length || edgeIndex === train.route.edgeIds.length - 1) {
					return {
						edgeLength: edge.length,
						fromNodeId: train.route.nodeIds[edgeIndex],
						index,
						progress: Math.min(1, remaining / edge.length),
						toNodeId: train.route.nodeIds[edgeIndex + 1]
					};
				}
				remaining -= edge.length;
			}
			throw new Error(`Unable to resolve carriage ${index} for ${train.id}`);
		});
	}

	#carriagePlacementsFor(train) {
		return this.#carriagesFor(train).map(carriage => {
			if (carriage.nodeId) {
				const node = this.#graph.getNode(carriage.nodeId);
				if (!node)
					throw new Error(`Unknown track node ${carriage.nodeId} for ${train.id}`);
				return { ...carriage, location: node.location };
			}

			const edgeId = [carriage.fromNodeId, carriage.toNodeId].sort().join("<->");
			return {
				...carriage,
				location: this.#graph.sampleEdge(edgeId, carriage.fromNodeId, carriage.progress)
			};
		});
	}

	snapshot() {
		return [...this.#trains.values()].map(train => ({
			blockedReason: train.blockedReason,
			carriageCount: train.carriageCount,
			carriageSpacing: train.carriageSpacing,
			direction: train.direction,
			formation: normalizeTrainFormation(train.formation),
			id: train.id,
			name: train.name,
			nodeId: train.nodeId,
			route: train.route && {
				nodeIds: [...train.route.nodeIds],
				edgeIds: [...train.route.edgeIds],
				length: train.route.length,
				graphRevision: train.route.graphRevision,
				reservedEdgeIds: [...train.route.reservedEdgeIds],
				settlingDistance: train.route.settlingDistance
			},
			schedule: train.schedule && {
				cyclic: train.schedule.cyclic,
				dwellRemaining: train.schedule.dwellRemaining,
				dwellTicks: train.schedule.dwellTicks,
				nextStopIndex: train.schedule.nextStopIndex,
				stopIds: [...train.schedule.stopIds]
			},
			scheduleRuntime: train.scheduleRuntime?.snapshot(),
			edgeIndex: train.edgeIndex,
			distanceOnEdge: train.distanceOnEdge,
			cruisingSpeed: train.cruisingSpeed,
			speed: train.speed,
			stopped: train.stopped,
			targetSpeed: train.targetSpeed
		}));
	}

	restore(records) {
		if (!Array.isArray(records))
			throw new TypeError("Train controller records must be an array");

		const ids = new Set(this.#trains.keys());
		const restored = records.map(record => this.#normalizeRestoredTrain(record, ids));
		const reserved = [];
		const occupied = [];
		try {
			for (const train of restored) {
				if (!train.route)
					continue;
				if (!this.#graph.tryReserve(train.id, [...train.route.reservedEdgeIds]))
					throw new Error(`Unable to restore reserved route for ${train.id}`);
				reserved.push(train.id);
				const claim = this.#occupancy.replace(train.id, this.#occupiedIntervalsFor(train), { graphRevision: train.route.graphRevision, tokenId: `${train.id}:${train.route.graphRevision}:${train.edgeIndex}` });
				if (!claim.ok)
					throw new Error(`Unable to restore occupancy for ${train.id}: ${claim.reason}`);
				occupied.push(train.id);
			}
		} catch (error) {
			for (const id of reserved)
				this.#graph.releaseReservations(id);
			for (const id of occupied)
				this.#occupancy.release(id);
			throw error;
		}
		for (const train of restored)
			this.#trains.set(train.id, train);
	}

	#requireTrain(id) {
		const train = this.#trains.get(id);
		if (!train)
			throw new Error(`Unknown train ${id}`);
		return train;
	}

	#projectTrain(train, distance) {
		const projected = {
			...train,
			route: train.route && {
				...train.route,
				edgeIds: [...train.route.edgeIds],
				nodeIds: [...train.route.nodeIds],
				reservedEdgeIds: new Set(train.route.reservedEdgeIds)
			}
		};
		if (projected.stopped || projected.blockedReason || !projected.route || distance === 0)
			return projected;

		let remaining = distance;
		while (remaining > 0 && projected.route) {
			if (projected.edgeIndex === projected.route.edgeIds.length) {
				const moved = Math.min(this.#tailDistance(projected) - projected.route.settlingDistance, remaining);
				projected.route.settlingDistance += moved;
				remaining -= moved;
				if (projected.route.settlingDistance >= this.#tailDistance(projected)) {
					projected.route = undefined;
					projected.direction = 0;
				}
				break;
			}
			const edgeId = projected.route.edgeIds[projected.edgeIndex];
			if (!this.#graph.isEdgeAvailable(edgeId))
				break;
			const edge = this.#graph.getEdge(edgeId);
			const moved = Math.min(edge.length - projected.distanceOnEdge, remaining);
			projected.distanceOnEdge += moved;
			remaining -= moved;
			if (projected.distanceOnEdge < edge.length)
				break;

			projected.nodeId = projected.route.nodeIds[projected.edgeIndex + 1];
			projected.edgeIndex++;
			projected.distanceOnEdge = 0;
			if (projected.edgeIndex === projected.route.edgeIds.length)
				projected.direction = 0;
		}
		return projected;
	}

	#normalizeRestoredTrain(record, ids) {
		if (!record || typeof record.id !== "string" || record.id.length === 0 || ids.has(record.id))
			throw new TypeError("Invalid train controller record");
		if (typeof record.nodeId !== "string" || !this.#graph.getNode(record.nodeId))
			throw new TypeError(`Invalid train node for ${record.id}`);
		ids.add(record.id);

		const route = this.#normalizeRestoredRoute(record);
		const edgeIndex = record.edgeIndex ?? 0;
		const distanceOnEdge = record.distanceOnEdge ?? 0;
		if (!Number.isInteger(edgeIndex) || edgeIndex < 0 || !Number.isFinite(distanceOnEdge) || distanceOnEdge < 0)
			throw new TypeError(`Invalid train position for ${record.id}`);
		if (route) {
			if (edgeIndex > route.edgeIds.length || record.nodeId !== route.nodeIds[edgeIndex])
				throw new TypeError(`Invalid train route position for ${record.id}`);
			if (edgeIndex < route.edgeIds.length && distanceOnEdge >= this.#graph.getEdge(route.edgeIds[edgeIndex]).length)
				throw new TypeError(`Invalid train distance for ${record.id}`);
			if (edgeIndex === route.edgeIds.length && distanceOnEdge !== 0)
				throw new TypeError(`Invalid completed train distance for ${record.id}`);
		}

		const schedule = this.#normalizeRestoredSchedule(record.id, record.schedule);
		const scheduleRuntime = this.#normalizeRestoredScheduleRuntime(record.id, record.scheduleRuntime);
		if (schedule && scheduleRuntime)
			throw new TypeError(`Train ${record.id} cannot restore two Schedule authorities`);
		const carriageCount = Number.isInteger(record.carriageCount) && record.carriageCount > 0 ? record.carriageCount : 1;
		const carriageSpacing = Number.isFinite(record.carriageSpacing) && record.carriageSpacing > 0 ? record.carriageSpacing : 2;
		const restored = {
			blockedReason: typeof record.blockedReason === "string" && record.blockedReason.length > 0 ? record.blockedReason : undefined,
			carriageCount,
			carriageSpacing,
			direction: 0,
			formation: record.formation ? normalizeTrainFormation(record.formation) : createTrainFormation({ carriageCount, carriageSpacing }),
			id: record.id,
			name: typeof record.name === "string" && record.name.length > 0 && record.name.length <= 64 ? record.name : record.id,
			nodeId: record.nodeId,
			route,
			schedule,
			scheduleRuntime,
			edgeIndex,
			distanceOnEdge,
			cruisingSpeed: Number.isFinite(record.cruisingSpeed) && record.cruisingSpeed > 0 ? record.cruisingSpeed : Number.isFinite(record.targetSpeed) && record.targetSpeed > 0 ? record.targetSpeed : 0.1,
			speed: Number.isFinite(record.speed) && record.speed >= 0 ? record.speed : 0,
			stopped: !!record.stopped,
			targetSpeed: Number.isFinite(record.targetSpeed) && record.targetSpeed > 0 ? record.targetSpeed : 0.1
		};
		if (route && route.settlingDistance > this.#tailDistance(restored))
			throw new TypeError(`Invalid train settling distance for ${record.id}`);
		if (route && edgeIndex < route.edgeIds.length && route.settlingDistance !== 0)
			throw new TypeError(`Invalid active train settling distance for ${record.id}`);
		restored.direction = this.#routeDirection(restored);
		if (!restored.route || restored.stopped || restored.blockedReason)
			restored.speed = 0;
		return restored;
	}

	#normalizeRestoredRoute(record) {
		if (!record.route)
			return undefined;
		const { edgeIds, nodeIds } = record.route;
		if (!Array.isArray(edgeIds) || edgeIds.length === 0 || !Array.isArray(nodeIds) || nodeIds.length !== edgeIds.length + 1)
			throw new TypeError(`Invalid train route for ${record.id}`);

		for (let index = 0; index < edgeIds.length; index++) {
			const edge = this.#graph.getEdge(edgeIds[index]);
			if (!edge || !this.#graph.getNode(nodeIds[index]) || !this.#graph.getNode(nodeIds[index + 1]))
				throw new TypeError(`Unknown track topology in route for ${record.id}`);
			const matchesForward = edge.leftId === nodeIds[index] && edge.rightId === nodeIds[index + 1];
			const matchesReverse = edge.rightId === nodeIds[index] && edge.leftId === nodeIds[index + 1];
			if (!matchesForward && !matchesReverse)
				throw new TypeError(`Disconnected route edge for ${record.id}`);
		}

		const reservedEdgeIds = record.route.reservedEdgeIds ?? edgeIds;
		if (!Array.isArray(reservedEdgeIds) || reservedEdgeIds.length === 0 || new Set(reservedEdgeIds).size !== reservedEdgeIds.length
			|| reservedEdgeIds.some(edgeId => !edgeIds.includes(edgeId)))
			throw new TypeError(`Invalid route reservation for ${record.id}`);
		const settlingDistance = record.route.settlingDistance ?? 0;
		if (!Number.isFinite(settlingDistance) || settlingDistance < 0)
			throw new TypeError(`Invalid train settling distance for ${record.id}`);
		return {
			nodeIds: [...nodeIds],
			edgeIds: [...edgeIds],
			graphRevision: Number.isInteger(record.route.graphRevision) ? record.route.graphRevision : this.#graph.getRevision?.() ?? 0,
			length: edgeIds.reduce((total, edgeId) => total + this.#graph.getEdge(edgeId).length, 0),
			reservedEdgeIds: new Set(reservedEdgeIds),
			settlingDistance
		};
	}

	#normalizeRestoredSchedule(id, schedule) {
		if (!schedule)
			return undefined;
		if (!Array.isArray(schedule.stopIds) || schedule.stopIds.length === 0 || schedule.stopIds.some(stopId => !this.#graph.getNode(stopId)))
			throw new TypeError(`Invalid train schedule for ${id}`);
		const dwellRemaining = schedule.dwellRemaining ?? 0;
		const dwellTicks = schedule.dwellTicks ?? 20;
		const cyclic = schedule.cyclic ?? true;
		const nextStopIndex = schedule.nextStopIndex ?? 0;
		if (!Number.isInteger(dwellRemaining) || dwellRemaining < 0 || !Number.isInteger(dwellTicks) || dwellTicks < 0
			|| typeof cyclic !== "boolean" || !Number.isInteger(nextStopIndex) || nextStopIndex < 0 || nextStopIndex > schedule.stopIds.length)
			throw new TypeError(`Invalid train schedule timing for ${id}`);
		return {
			cyclic,
			dwellRemaining,
			dwellTicks,
			nextStopIndex: cyclic ? nextStopIndex % schedule.stopIds.length : nextStopIndex,
			stopIds: [...schedule.stopIds]
		};
	}

	#normalizeRestoredScheduleRuntime(id, snapshot) {
		if (!snapshot)
			return undefined;
		let runtime;
		try {
			runtime = new ScheduleRuntime();
			runtime.restore(snapshot);
		} catch (error) {
			throw new TypeError(`Invalid Schedule runtime for ${id}: ${error}`);
		}
		if (runtime.schedule.entries.some(entry => entry.instruction.type === "destination" && entry.instruction.exact && !this.#graph.getNode(entry.instruction.filter)))
			throw new TypeError(`Unknown Schedule destination for ${id}`);
		return runtime;
	}

	#advanceScheduleAst(train) {
		if (!train.scheduleRuntime || train.route)
			return false;
		const before = train.scheduleRuntime.snapshot();
		const result = train.scheduleRuntime.tick(this.#scheduleEnvironmentFor(train));
		return result.changed || before.state !== train.scheduleRuntime.state;
	}

	#scheduleEnvironmentFor(train) {
		const external = this.#scheduleEnvironment;
		const invoke = (name, fallback, ...args) => typeof external?.[name] === "function" ? external[name](train.id, ...args) : fallback;
		const payloads = train.formation.carriages.map(carriage => carriage.payload).filter(Boolean);
		const itemCount = filter => payloads.flatMap(payload => payload.items ?? []).filter(stack => stack.typeId === filter || stack.tags?.includes?.(filter)).reduce((total, stack) => total + (stack.count ?? stack.amount ?? 0), 0);
		const fluidAmount = fluidId => payloads.flatMap(payload => payload.fluids ?? []).filter(stack => stack.typeId === fluidId).reduce((total, stack) => total + (stack.amount ?? 0), 0);
		const passengerCount = train.formation.carriages.flatMap(carriage => carriage.seats).filter(seat => seat.passengerId).length;
		const formationCargoEmpty = payloads.every(payload => (payload.items ?? []).length === 0 && (payload.fluids ?? []).length === 0);
		return {
			atDestination: destination => train.nodeId === destination,
			cargoEmpty: () => formationCargoEmpty && invoke("cargoEmpty", true),
			cargoIdleTicks: () => invoke("cargoIdleTicks", 0),
			deliverPackages: address => invoke("deliverPackages", false, address),
			fluidAmount: fluidId => fluidAmount(fluidId) + invoke("fluidAmount", 0, fluidId),
			itemCount: filter => itemCount(filter) + invoke("itemCount", 0, filter),
			navigationActive: () => !!train.route,
			passengerCount: () => passengerCount + invoke("passengerCount", 0),
			redstoneLinkPowered: (frequencyA, frequencyB) => invoke("redstoneLinkPowered", false, frequencyA, frequencyB),
			renameTrain: title => {
				train.name = title || train.id;
				return invoke("renameTrain", true, title);
			},
			resolveDestination: (filter, exact) => {
				const resolved = invoke("resolveDestination", undefined, filter, exact);
				if (resolved !== undefined)
					return resolved;
				if (exact)
					return this.#graph.getNode(filter) ? filter : undefined;
				return this.#graph.getNodes().map(node => node.id).filter(id => id.includes(filter)).sort()[0];
			},
			retrievePackages: address => invoke("retrievePackages", false, address),
			setThrottle: percent => {
				train.targetSpeed = train.cruisingSpeed * percent / 100;
				return invoke("setThrottle", true, percent);
			},
			startNavigation: destination => this.#startRoute(train, destination).ok,
			stationPowered: () => invoke("stationPowered", false),
			timeOfDay: () => invoke("timeOfDay", 0)
		};
	}

	#advanceSchedule(train) {
		const schedule = train.schedule;
		if (!schedule || train.route)
			return false;
		if (schedule.dwellRemaining > 0) {
			schedule.dwellRemaining--;
			return false;
		}

		if (schedule.nextStopIndex >= schedule.stopIds.length) {
			if (!schedule.cyclic)
				return false;
			schedule.nextStopIndex = 0;
		}
		const destinationId = schedule.stopIds[schedule.nextStopIndex];
		schedule.nextStopIndex++;
		if (destinationId === train.nodeId) {
			schedule.dwellRemaining = schedule.dwellTicks;
			return false;
		}

		const route = this.#graph.findRoute(train.nodeId, destinationId);
		if (!route || !this.#graph.tryReserve(train.id, [route.edgeIds[0]]))
			return false;
		this.#occupancy.setGraphRevision(this.#graph.getRevision?.() ?? 0);
		train.route = {
			...route,
			graphRevision: this.#graph.getRevision?.() ?? 0,
			reservedEdgeIds: new Set([route.edgeIds[0]]),
			settlingDistance: 0
		};
		train.edgeIndex = 0;
		train.distanceOnEdge = 0;
		train.direction = this.#routeDirection(train);
		return true;
	}

	#startRoute(train, destinationId) {
		if (train.route)
			return { ok: false, reason: "already_moving" };
		if (!this.#graph.getNode(destinationId))
			return { ok: false, reason: "unknown_destination" };
		if (destinationId === train.nodeId)
			return { ok: true, route: { edgeIds: [], length: 0, nodeIds: [train.nodeId] } };
		const route = this.#graph.findRoute(train.nodeId, destinationId);
		if (!route)
			return { ok: false, reason: "route_unavailable" };
		if (!this.#graph.tryReserve(train.id, [route.edgeIds[0]]))
			return { ok: false, reason: "route_reserved" };
		this.#occupancy.setGraphRevision(this.#graph.getRevision?.() ?? 0);
		train.route = {
			...route,
			graphRevision: this.#graph.getRevision?.() ?? 0,
			reservedEdgeIds: new Set([route.edgeIds[0]]),
			settlingDistance: 0
		};
		train.edgeIndex = 0;
		train.distanceOnEdge = 0;
		train.direction = this.#routeDirection(train);
		return { ok: true, route };
	}

	#routeDirection(train) {
		if (!train.route || train.edgeIndex >= train.route.edgeIds.length)
			return 0;
		const edge = this.#graph.getEdge(train.route.edgeIds[train.edgeIndex]);
		return edge.leftId === train.route.nodeIds[train.edgeIndex] ? 1 : -1;
	}

	#releaseClearedEdges(train) {
		let leadDistance = train.distanceOnEdge;
		for (let index = 0; index < train.edgeIndex; index++)
			leadDistance += this.#graph.getEdge(train.route.edgeIds[index]).length;
		leadDistance += train.route.settlingDistance;
		const tailDistance = leadDistance - this.#tailDistance(train);
		if (tailDistance < 0)
			return;

		let edgeEnd = 0;
		for (const edgeId of train.route.edgeIds) {
			edgeEnd += this.#graph.getEdge(edgeId).length;
			if (edgeEnd > tailDistance)
				break;
			if (train.route.reservedEdgeIds.delete(edgeId))
				this.#graph.releaseEdge(train.id, edgeId);
		}
	}

	#tailDistance(train) {
		return trainCarriageLeadOffsets(train.formation).at(-1)?.leadOffset ?? 0;
	}

	#occupiedIntervalsFor(train) {
		if (!train.route)
			return [];
		let lead = train.route.settlingDistance + train.distanceOnEdge;
		for (let index = 0; index < train.edgeIndex; index++)
			lead += this.#graph.getEdge(train.route.edgeIds[index]).length;
		const tail = Math.max(0, lead - this.#tailDistance(train));
		const claims = [];
		let cursor = 0;
		for (const edgeId of train.route.edgeIds) {
			const edge = this.#graph.getEdge(edgeId);
			const start = Math.max(0, tail - cursor);
			const end = Math.min(edge.length, lead - cursor);
			if (end > start)
				claims.push({ edgeId, end, start });
			cursor += edge.length;
		}
		if (claims.length === 0 && train.edgeIndex < train.route.edgeIds.length) {
			const edgeId = train.route.edgeIds[train.edgeIndex];
			claims.push({ edgeId, end: Math.min(this.#graph.getEdge(edgeId).length, .001), start: 0 });
		}
		return claims;
	}

	#completeRoute(train) {
		this.#graph.releaseReservations(train.id);
		this.#occupancy.release(train.id);
		train.route = undefined;
		train.direction = 0;
		if (train.scheduleRuntime?.state === SCHEDULE_RUNTIME_STATE.IN_TRANSIT)
			train.scheduleRuntime.destinationReached();
		else if (train.schedule)
			train.schedule.dwellRemaining = train.schedule.dwellTicks;
	}
}
