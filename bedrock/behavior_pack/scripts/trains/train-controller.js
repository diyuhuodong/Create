export class TrainController {
	#graph;
	#trains = new Map();

	constructor(trackGraph) {
		for (const method of ["findRoute", "getEdge", "releaseEdge", "releaseReservations", "tryReserve"]) {
			if (typeof trackGraph?.[method] !== "function")
				throw new TypeError(`TrainController track graph requires ${method}()`);
		}
		this.#graph = trackGraph;
	}

	registerTrain({ id, nodeId, carriageCount = 1, carriageSpacing = 2 }) {
		if (!id || this.#trains.has(id))
			throw new Error("Train ids must be unique");
		if (!Number.isInteger(carriageCount) || carriageCount < 1 || !Number.isFinite(carriageSpacing) || carriageSpacing <= 0)
			throw new RangeError("Trains require at least one carriage and positive carriage spacing");
		this.#trains.set(id, {
			carriageCount,
			carriageSpacing,
			id,
			nodeId,
			route: undefined,
			schedule: undefined,
			edgeIndex: 0,
			distanceOnEdge: 0
		});
	}

	dispatch(id, destinationId) {
		const train = this.#requireTrain(id);
		if (train.route || train.schedule)
			return false;

		const route = this.#graph.findRoute(train.nodeId, destinationId);
		if (!route || !this.#graph.tryReserve(id, route.edgeIds))
			return false;

		train.route = route;
		train.edgeIndex = 0;
		train.distanceOnEdge = 0;
		return true;
	}

	setSchedule(id, { stopIds, dwellTicks = 20 }) {
		const train = this.#requireTrain(id);
		if (train.route || !Array.isArray(stopIds) || stopIds.length === 0 || !Number.isInteger(dwellTicks) || dwellTicks < 0)
			return false;
		if (stopIds.some(stopId => !this.#graph.getNode(stopId)))
			return false;

		train.schedule = {
			dwellRemaining: 0,
			dwellTicks,
			nextStopIndex: 0,
			stopIds: [...stopIds]
		};
		this.#advanceSchedule(train);
		return true;
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
		if (!Number.isFinite(distance) || distance < 0)
			throw new RangeError("Train movement distance must be non-negative");

		const train = this.#requireTrain(id);
		if (!train.route) {
			this.#advanceSchedule(train);
			if (!train.route || distance === 0)
				return this.getTrain(id);
		}
		if (distance === 0)
			return this.getTrain(id);

		let remaining = distance;
		while (remaining > 0 && train.route) {
			const edgeId = train.route.edgeIds[train.edgeIndex];
			const edge = this.#graph.getEdge(edgeId);
			const available = edge.length - train.distanceOnEdge;
			const moved = Math.min(available, remaining);
			train.distanceOnEdge += moved;
			remaining -= moved;

			if (train.distanceOnEdge < edge.length)
				break;

			train.nodeId = train.route.nodeIds[train.edgeIndex + 1];
			this.#graph.releaseEdge(id, edgeId);
			train.edgeIndex++;
			train.distanceOnEdge = 0;

			if (train.edgeIndex === train.route.edgeIds.length) {
				this.#graph.releaseReservations(id);
				train.route = undefined;
				if (train.schedule)
					train.schedule.dwellRemaining = train.schedule.dwellTicks;
			}
		}

		return this.getTrain(id);
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

	snapshot() {
		return [...this.#trains.values()].map(train => ({
			carriageCount: train.carriageCount,
			carriageSpacing: train.carriageSpacing,
			id: train.id,
			nodeId: train.nodeId,
			route: train.route && {
				nodeIds: [...train.route.nodeIds],
				edgeIds: [...train.route.edgeIds],
				length: train.route.length
			},
			schedule: train.schedule && {
				dwellRemaining: train.schedule.dwellRemaining,
				dwellTicks: train.schedule.dwellTicks,
				nextStopIndex: train.schedule.nextStopIndex,
				stopIds: [...train.schedule.stopIds]
			},
			edgeIndex: train.edgeIndex,
			distanceOnEdge: train.distanceOnEdge
		}));
	}

	restore(records) {
		if (!Array.isArray(records))
			throw new TypeError("Train controller records must be an array");

		for (const record of records) {
			if (!record?.id || this.#trains.has(record.id) || !record.nodeId)
				throw new TypeError("Invalid train controller record");
			if (record.route && !this.#graph.tryReserve(record.id, record.route.edgeIds))
				throw new Error(`Unable to restore reserved route for ${record.id}`);

			const schedule = record.schedule;
			if (schedule && (!Array.isArray(schedule.stopIds) || schedule.stopIds.length === 0 || schedule.stopIds.some(stopId => !this.#graph.getNode(stopId))))
				throw new TypeError(`Invalid train schedule for ${record.id}`);
			this.#trains.set(record.id, {
				carriageCount: Number.isInteger(record.carriageCount) && record.carriageCount > 0 ? record.carriageCount : 1,
				carriageSpacing: Number.isFinite(record.carriageSpacing) && record.carriageSpacing > 0 ? record.carriageSpacing : 2,
				id: record.id,
				nodeId: record.nodeId,
				route: record.route && {
					nodeIds: [...record.route.nodeIds],
					edgeIds: [...record.route.edgeIds],
					length: record.route.length
				},
				schedule: schedule && {
					dwellRemaining: Math.max(0, schedule.dwellRemaining ?? 0),
					dwellTicks: Math.max(0, schedule.dwellTicks ?? 20),
					nextStopIndex: Math.max(0, schedule.nextStopIndex ?? 0) % schedule.stopIds.length,
					stopIds: [...schedule.stopIds]
				},
				edgeIndex: record.edgeIndex ?? 0,
				distanceOnEdge: record.distanceOnEdge ?? 0
			});
		}
	}

	#requireTrain(id) {
		const train = this.#trains.get(id);
		if (!train)
			throw new Error(`Unknown train ${id}`);
		return train;
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
		train.route = route;
		train.edgeIndex = 0;
		train.distanceOnEdge = 0;
		return true;
	}
}
