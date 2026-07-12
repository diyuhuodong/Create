function edgeId(leftId, rightId) {
	return [leftId, rightId].sort().join("<->");
}

export class TrackGraph {
	#nodes = new Map();
	#edges = new Map();

	addNode({ id, location }) {
		if (!id || !location)
			throw new TypeError("Track nodes require an id and location");
		if (this.#nodes.has(id))
			throw new Error(`Track node ${id} already exists`);

		this.#nodes.set(id, { id, location: { ...location } });
	}

	connect(leftId, rightId, length) {
		if (!this.#nodes.has(leftId) || !this.#nodes.has(rightId))
			throw new Error("Track connections require registered nodes");
		if (leftId === rightId || !Number.isFinite(length) || length <= 0)
			throw new RangeError("Track connections require a positive length between different nodes");

		const id = edgeId(leftId, rightId);
		if (this.#edges.has(id))
			throw new Error(`Track edge ${id} already exists`);

		this.#edges.set(id, { id, leftId, rightId, length, reservedBy: undefined });
		return id;
	}

	removeNode(id) {
		if (!this.#nodes.has(id))
			return false;
		for (const edge of this.#edgesFor(id)) {
			if (edge.reservedBy !== undefined)
				throw new Error(`Cannot remove track node ${id} while ${edge.id} is reserved`);
			this.#edges.delete(edge.id);
		}
		this.#nodes.delete(id);
		return true;
	}

	findRoute(startId, destinationId) {
		if (!this.#nodes.has(startId) || !this.#nodes.has(destinationId))
			throw new Error("Routes require registered start and destination nodes");

		const distances = new Map([[startId, 0]]);
		const previous = new Map();
		const pending = new Set(this.#nodes.keys());

		while (pending.size > 0) {
			const currentId = [...pending]
				.filter(id => distances.has(id))
				.sort((left, right) => distances.get(left) - distances.get(right))[0];
			if (!currentId)
				break;

			pending.delete(currentId);
			if (currentId === destinationId)
				break;

			for (const edge of this.#edgesFor(currentId)) {
				if (edge.reservedBy !== undefined)
					continue;

				const adjacentId = edge.leftId === currentId ? edge.rightId : edge.leftId;
				if (!pending.has(adjacentId))
					continue;

				const candidate = distances.get(currentId) + edge.length;
				if (candidate < (distances.get(adjacentId) ?? Infinity)) {
					distances.set(adjacentId, candidate);
					previous.set(adjacentId, { edgeId: edge.id, nodeId: currentId });
				}
			}
		}

		if (!distances.has(destinationId))
			return undefined;

		const nodeIds = [destinationId];
		const edgeIds = [];
		for (let currentId = destinationId; currentId !== startId;) {
			const step = previous.get(currentId);
			if (!step)
				throw new Error("Route reconstruction failed");
			edgeIds.unshift(step.edgeId);
			nodeIds.unshift(step.nodeId);
			currentId = step.nodeId;
		}

		return { nodeIds, edgeIds, length: distances.get(destinationId) };
	}

	tryReserve(trainId, edgeIds) {
		if (!trainId || !Array.isArray(edgeIds) || edgeIds.length === 0)
			throw new TypeError("Reservations require a train id and at least one edge");

		const edges = edgeIds.map(id => {
			const edge = this.#edges.get(id);
			if (!edge)
				throw new Error(`Unknown track edge ${id}`);
			return edge;
		});

		if (edges.some(edge => edge.reservedBy !== undefined && edge.reservedBy !== trainId))
			return false;

		for (const edge of edges)
			edge.reservedBy = trainId;
		return true;
	}

	releaseReservations(trainId) {
		let released = 0;
		for (const edge of this.#edges.values()) {
			if (edge.reservedBy === trainId) {
				edge.reservedBy = undefined;
				released++;
			}
		}
		return released;
	}

	releaseEdge(trainId, id) {
		const edge = this.#edges.get(id);
		if (!edge || edge.reservedBy !== trainId)
			return false;

		edge.reservedBy = undefined;
		return true;
	}

	getEdge(id) {
		const edge = this.#edges.get(id);
		return edge && { ...edge };
	}

	getNode(id) {
		const node = this.#nodes.get(id);
		return node && { id: node.id, location: { ...node.location } };
	}

	snapshot() {
		return {
			nodes: [...this.#nodes.values()].map(node => ({ id: node.id, location: { ...node.location } })),
			edges: [...this.#edges.values()].map(edge => ({
				id: edge.id,
				leftId: edge.leftId,
				rightId: edge.rightId,
				length: edge.length
			}))
		};
	}

	restore(snapshot) {
		if (!Array.isArray(snapshot?.nodes) || !Array.isArray(snapshot?.edges))
			throw new TypeError("Invalid track graph snapshot");
		this.#nodes.clear();
		this.#edges.clear();
		for (const node of snapshot.nodes)
			this.addNode(node);
		for (const edge of snapshot.edges)
			this.connect(edge.leftId, edge.rightId, edge.length);
	}

	#edgesFor(nodeId) {
		return [...this.#edges.values()].filter(edge => edge.leftId === nodeId || edge.rightId === nodeId);
	}
}
