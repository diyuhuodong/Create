export class TrainController {
	#graph;
	#trains = new Map();

	constructor(trackGraph) {
		for (const method of ["findRoute", "getEdge", "getNode", "isEdgeAvailable", "releaseEdge", "releaseReservations", "sampleEdge", "tryReserve"]) {
			if (typeof trackGraph?.[method] !== "function")
				throw new TypeError(`TrainController track graph requires ${method}()`);
		}
		this.#graph = trackGraph;
	}

	registerTrain({ id, nodeId, carriageCount = 1, carriageSpacing = 2, speed = 0.1 }) {
		if (!id || this.#trains.has(id))
			throw new Error("Train ids must be unique");
		if (!Number.isInteger(carriageCount) || carriageCount < 1 || !Number.isFinite(carriageSpacing) || carriageSpacing <= 0)
			throw new RangeError("Trains require at least one carriage and positive carriage spacing");
		if (!Number.isFinite(speed) || speed <= 0)
			throw new RangeError("Trains require a positive cruising speed");
		this.#trains.set(id, {
			blockedReason: undefined,
			carriageCount,
			carriageSpacing,
			direction: 0,
			id,
			nodeId,
			route: undefined,
			schedule: undefined,
			edgeIndex: 0,
			distanceOnEdge: 0,
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
		if (train.schedule)
			return { ok: false, reason: "scheduled" };
		if (!this.#graph.getNode(destinationId))
			return { ok: false, reason: "unknown_destination" };

		const route = this.#graph.findRoute(train.nodeId, destinationId);
		if (!route)
			return { ok: false, reason: "route_unavailable" };
		if (!this.#graph.tryReserve(id, route.edgeIds))
			return { ok: false, reason: "route_reserved" };

		train.route = {
			...route,
			reservedEdgeIds: new Set(route.edgeIds)
		};
		train.edgeIndex = 0;
		train.distanceOnEdge = 0;
		train.direction = this.#routeDirection(train);
		return { ok: true, route };
	}

	setSchedule(id, { stopIds, dwellTicks = 20 }) {
		return this.setScheduleWithReason(id, { stopIds, dwellTicks }).ok;
	}

	setScheduleWithReason(id, { stopIds, dwellTicks = 20 }) {
		const train = this.#requireTrain(id);
		if (train.route)
			return { ok: false, reason: "already_moving" };
		if (!Array.isArray(stopIds) || stopIds.length === 0 || !Number.isInteger(dwellTicks) || dwellTicks < 0)
			return { ok: false, reason: "invalid_schedule" };
		if (stopIds.some(stopId => !this.#graph.getNode(stopId)))
			return { ok: false, reason: "unknown_station" };

		train.schedule = {
			dwellRemaining: 0,
			dwellTicks,
			nextStopIndex: 0,
			stopIds: [...stopIds]
		};
		this.#advanceSchedule(train);
		return { ok: true, state: train.route ? "moving" : "waiting" };
	}

	clearSchedule(id) {
		const train = this.#requireTrain(id);
		if (train.route)
			return false;
		const hadSchedule = !!train.schedule;
		train.schedule = undefined;
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
		if (!train.route) {
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

		let remaining = distance;
		let movedDistance = 0;
		while (remaining > 0 && train.route) {
			const edgeId = train.route.edgeIds[train.edgeIndex];
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
				this.#graph.releaseReservations(id);
				train.route = undefined;
				train.direction = 0;
				if (train.schedule)
					train.schedule.dwellRemaining = train.schedule.dwellTicks;
			} else
				train.direction = this.#routeDirection(train);
		}
		if (train.route)
			this.#releaseClearedEdges(train);
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
		this.#trains.delete(id);
		return true;
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
		if (train.schedule) {
			state.schedule = {
				dwellRemaining: train.schedule.dwellRemaining,
				dwellTicks: train.schedule.dwellTicks,
				nextStopIndex: train.schedule.nextStopIndex,
				stopIds: [...train.schedule.stopIds]
			};
		}
		if (!train.route)
			return state;

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
		if (!train.route) {
			return Array.from({ length: train.carriageCount }, (_, index) => ({
				index,
				nodeId: train.nodeId
			}));
		}

		let leadDistance = train.distanceOnEdge;
		for (let index = 0; index < train.edgeIndex; index++)
			leadDistance += this.#graph.getEdge(train.route.edgeIds[index]).length;

		return Array.from({ length: train.carriageCount }, (_, index) => {
			let remaining = Math.max(0, leadDistance - index * train.carriageSpacing);
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
			throw new Error(`Unable to resolve carriage ${index} for ${id}`);
		});
	}

	getCarriagePlacements(id) {
		return this.getCarriages(id).map(carriage => {
			if (carriage.nodeId) {
				const node = this.#graph.getNode(carriage.nodeId);
				if (!node)
					throw new Error(`Unknown track node ${carriage.nodeId}`);
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
			id: train.id,
			nodeId: train.nodeId,
			route: train.route && {
				nodeIds: [...train.route.nodeIds],
				edgeIds: [...train.route.edgeIds],
				length: train.route.length,
				reservedEdgeIds: [...train.route.reservedEdgeIds]
			},
			schedule: train.schedule && {
				dwellRemaining: train.schedule.dwellRemaining,
				dwellTicks: train.schedule.dwellTicks,
				nextStopIndex: train.schedule.nextStopIndex,
				stopIds: [...train.schedule.stopIds]
			},
			edgeIndex: train.edgeIndex,
			distanceOnEdge: train.distanceOnEdge,
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
		try {
			for (const train of restored) {
				if (!train.route)
					continue;
				if (!this.#graph.tryReserve(train.id, [...train.route.reservedEdgeIds]))
					throw new Error(`Unable to restore reserved route for ${train.id}`);
				reserved.push(train.id);
			}
		} catch (error) {
			for (const id of reserved)
				this.#graph.releaseReservations(id);
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
			if (edgeIndex >= route.edgeIds.length || record.nodeId !== route.nodeIds[edgeIndex])
				throw new TypeError(`Invalid train route position for ${record.id}`);
			if (distanceOnEdge >= this.#graph.getEdge(route.edgeIds[edgeIndex]).length)
				throw new TypeError(`Invalid train distance for ${record.id}`);
		}

		const schedule = this.#normalizeRestoredSchedule(record.id, record.schedule);
		const restored = {
			blockedReason: typeof record.blockedReason === "string" && record.blockedReason.length > 0 ? record.blockedReason : undefined,
			carriageCount: Number.isInteger(record.carriageCount) && record.carriageCount > 0 ? record.carriageCount : 1,
			carriageSpacing: Number.isFinite(record.carriageSpacing) && record.carriageSpacing > 0 ? record.carriageSpacing : 2,
			direction: 0,
			id: record.id,
			nodeId: record.nodeId,
			route,
			schedule,
			edgeIndex,
			distanceOnEdge,
			speed: Number.isFinite(record.speed) && record.speed >= 0 ? record.speed : 0,
			stopped: !!record.stopped,
			targetSpeed: Number.isFinite(record.targetSpeed) && record.targetSpeed > 0 ? record.targetSpeed : 0.1
		};
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
		return {
			nodeIds: [...nodeIds],
			edgeIds: [...edgeIds],
			length: edgeIds.reduce((total, edgeId) => total + this.#graph.getEdge(edgeId).length, 0),
			reservedEdgeIds: new Set(reservedEdgeIds)
		};
	}

	#normalizeRestoredSchedule(id, schedule) {
		if (!schedule)
			return undefined;
		if (!Array.isArray(schedule.stopIds) || schedule.stopIds.length === 0 || schedule.stopIds.some(stopId => !this.#graph.getNode(stopId)))
			throw new TypeError(`Invalid train schedule for ${id}`);
		const dwellRemaining = schedule.dwellRemaining ?? 0;
		const dwellTicks = schedule.dwellTicks ?? 20;
		const nextStopIndex = schedule.nextStopIndex ?? 0;
		if (!Number.isInteger(dwellRemaining) || dwellRemaining < 0 || !Number.isInteger(dwellTicks) || dwellTicks < 0
			|| !Number.isInteger(nextStopIndex) || nextStopIndex < 0)
			throw new TypeError(`Invalid train schedule timing for ${id}`);
		return {
			dwellRemaining,
			dwellTicks,
			nextStopIndex: nextStopIndex % schedule.stopIds.length,
			stopIds: [...schedule.stopIds]
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

		const destinationId = schedule.stopIds[schedule.nextStopIndex];
		schedule.nextStopIndex = (schedule.nextStopIndex + 1) % schedule.stopIds.length;
		if (destinationId === train.nodeId) {
			schedule.dwellRemaining = schedule.dwellTicks;
			return false;
		}

		const route = this.#graph.findRoute(train.nodeId, destinationId);
		if (!route || !this.#graph.tryReserve(train.id, route.edgeIds))
			return false;
		train.route = {
			...route,
			reservedEdgeIds: new Set(route.edgeIds)
		};
		train.edgeIndex = 0;
		train.distanceOnEdge = 0;
		train.direction = this.#routeDirection(train);
		return true;
	}

	#routeDirection(train) {
		if (!train.route)
			return 0;
		const edge = this.#graph.getEdge(train.route.edgeIds[train.edgeIndex]);
		return edge.leftId === train.route.nodeIds[train.edgeIndex] ? 1 : -1;
	}

	#releaseClearedEdges(train) {
		let leadDistance = train.distanceOnEdge;
		for (let index = 0; index < train.edgeIndex; index++)
			leadDistance += this.#graph.getEdge(train.route.edgeIds[index]).length;
		const tailDistance = leadDistance - (train.carriageCount - 1) * train.carriageSpacing;
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
}
