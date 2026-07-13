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

	registerTrain({ id, nodeId }) {
		if (!id || this.#trains.has(id))
			throw new Error("Train ids must be unique");
		this.#trains.set(id, { id, nodeId, route: undefined, edgeIndex: 0, distanceOnEdge: 0 });
	}

	dispatch(id, destinationId) {
		const train = this.#requireTrain(id);
		if (train.route)
			return false;

		const route = this.#graph.findRoute(train.nodeId, destinationId);
		if (!route || !this.#graph.tryReserve(id, route.edgeIds))
			return false;

		train.route = route;
		train.edgeIndex = 0;
		train.distanceOnEdge = 0;
		return true;
	}

	tick(id, distance) {
		if (!Number.isFinite(distance) || distance < 0)
			throw new RangeError("Train movement distance must be non-negative");

		const train = this.#requireTrain(id);
		if (!train.route || distance === 0)
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

	snapshot() {
		return [...this.#trains.values()].map(train => ({
			id: train.id,
			nodeId: train.nodeId,
			route: train.route && {
				nodeIds: [...train.route.nodeIds],
				edgeIds: [...train.route.edgeIds],
				length: train.route.length
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

			this.#trains.set(record.id, {
				id: record.id,
				nodeId: record.nodeId,
				route: record.route && {
					nodeIds: [...record.route.nodeIds],
					edgeIds: [...record.route.edgeIds],
					length: record.route.length
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
}
