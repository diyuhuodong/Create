function edgeId(leftId, rightId) {
	return [leftId, rightId].sort().join("<->");
}

function chunkId(location) {
	return `${Math.floor(location.x / 16)}:${Math.floor(location.z / 16)}`;
}

function distance(left, right) {
	return Math.hypot(right.x - left.x, right.y - left.y, right.z - left.z);
}

function validatePoint(point) {
	return point && [point.x, point.y, point.z].every(Number.isFinite);
}

export class TrackGraph {
	#chunks = new Map();
	#nodes = new Map();
	#edges = new Map();

	addNode({ id, location }) {
		if (!id || !location)
			throw new TypeError("Track nodes require an id and location");
		if (this.#nodes.has(id))
			throw new Error(`Track node ${id} already exists`);

		const node = { chunkAvailable: true, id, location: { ...location }, trackAvailable: true };
		this.#nodes.set(id, node);
		const chunk = chunkId(location);
		let nodes = this.#chunks.get(chunk);
		if (!nodes) {
			nodes = new Set();
			this.#chunks.set(chunk, nodes);
		}
		nodes.add(id);
	}

	connect(leftId, rightId, length, points) {
		if (!this.#nodes.has(leftId) || !this.#nodes.has(rightId))
			throw new Error("Track connections require registered nodes");
		if (leftId === rightId)
			throw new RangeError("Track connections require a positive length between different nodes");

		let geometry;
		if (points !== undefined) {
			if (!Array.isArray(points) || points.length < 2 || points.some(point => !validatePoint(point)))
				throw new TypeError("Track geometry requires at least two finite points");
			geometry = points.map(point => ({ ...point }));
			length = geometry.slice(1).reduce((total, point, index) => total + distance(geometry[index], point), 0);
		}
		if (!Number.isFinite(length) || length <= 0)
			throw new RangeError("Track connections require a positive length between different nodes");

		const id = edgeId(leftId, rightId);
		if (this.#edges.has(id))
			throw new Error(`Track edge ${id} already exists`);

		this.#edges.set(id, { id, leftId, rightId, length, points: geometry, reservedBy: undefined });
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
		const node = this.#nodes.get(id);
		this.#nodes.delete(id);
		const chunk = chunkId(node.location);
		const nodes = this.#chunks.get(chunk);
		nodes?.delete(id);
		if (nodes?.size === 0)
			this.#chunks.delete(chunk);
		return true;
	}

	canRemoveNode(id) {
		if (!this.#nodes.has(id))
			return true;
		return this.#edgesFor(id).every(edge => edge.reservedBy === undefined);
	}

	findRoute(startId, destinationId) {
		if (!this.#nodes.has(startId) || !this.#nodes.has(destinationId))
			throw new Error("Routes require registered start and destination nodes");
		if (!this.#isNodeAvailable(this.#nodes.get(startId)) || !this.#isNodeAvailable(this.#nodes.get(destinationId)))
			return undefined;

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
				if (!this.#isNodeAvailable(this.#nodes.get(adjacentId)))
					continue;
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
		return edge && {
			...edge,
			points: edge.points?.map(point => ({ ...point }))
		};
	}

	sampleEdge(id, fromNodeId, progress) {
		const edge = this.#edges.get(id);
		if (!edge || (fromNodeId !== edge.leftId && fromNodeId !== edge.rightId))
			throw new Error(`Track edge ${id} is not connected to ${fromNodeId}`);
		if (!Number.isFinite(progress) || progress < 0 || progress > 1)
			throw new RangeError("Track sampling progress must be between zero and one");

		const normalizedProgress = fromNodeId === edge.leftId ? progress : 1 - progress;
		const points = edge.points ?? [this.#nodes.get(edge.leftId).location, this.#nodes.get(edge.rightId).location];
		let remaining = normalizedProgress * edge.length;
		for (let index = 1; index < points.length; index++) {
			const segmentLength = distance(points[index - 1], points[index]);
			if (remaining <= segmentLength || index === points.length - 1) {
				const ratio = segmentLength === 0 ? 0 : Math.min(1, remaining / segmentLength);
				return {
					x: points[index - 1].x + (points[index].x - points[index - 1].x) * ratio,
					y: points[index - 1].y + (points[index].y - points[index - 1].y) * ratio,
					z: points[index - 1].z + (points[index].z - points[index - 1].z) * ratio
				};
			}
			remaining -= segmentLength;
		}
		return { ...points.at(-1) };
	}

	getNode(id) {
		const node = this.#nodes.get(id);
		return node && { available: this.#isNodeAvailable(node), id: node.id, location: { ...node.location } };
	}

	getNodes() {
		return [...this.#nodes.values()].map(node => ({
			available: this.#isNodeAvailable(node),
			id: node.id,
			location: { ...node.location }
		}));
	}

	getChunkDiagnostics() {
		return {
			chunks: this.#chunks.size,
			loadedChunks: [...this.#chunks.entries()]
				.filter(([, nodeIds]) => [...nodeIds].some(id => this.#nodes.get(id).chunkAvailable)).length
		};
	}

	setNodeAvailable(id, available) {
		const node = this.#nodes.get(id);
		if (!node)
			return false;
		const normalized = !!available;
		if (node.trackAvailable === normalized)
			return false;
		node.trackAvailable = normalized;
		return true;
	}

	setChunkAvailable(location, available) {
		if (!Number.isFinite(location?.x) || !Number.isFinite(location?.z))
			throw new TypeError("Track chunk availability requires a finite location");
		const nodes = this.#chunks.get(chunkId(location));
		if (!nodes)
			return 0;
		const normalized = !!available;
		let changed = 0;
		for (const id of nodes) {
			const node = this.#nodes.get(id);
			if (node.chunkAvailable !== normalized) {
				node.chunkAvailable = normalized;
				changed++;
			}
		}
		return changed;
	}

	isEdgeAvailable(id) {
		const edge = this.#edges.get(id);
		return !!edge && this.#isNodeAvailable(this.#nodes.get(edge.leftId)) && this.#isNodeAvailable(this.#nodes.get(edge.rightId));
	}

	snapshot() {
		const chunks = new Map([...this.#chunks.keys()].map(id => [id, { edges: [], id, nodes: [] }]));
		for (const node of this.#nodes.values())
			chunks.get(chunkId(node.location)).nodes.push({ id: node.id, location: { ...node.location } });
		for (const edge of this.#edges.values()) {
			const owner = chunks.get(chunkId(this.#nodes.get(edge.leftId).location));
			owner.edges.push({
				id: edge.id,
				leftId: edge.leftId,
				rightId: edge.rightId,
				length: edge.length,
				points: edge.points?.map(point => ({ ...point }))
			});
		}
		return {
			chunks: [...chunks.values()]
		};
	}

	restore(snapshot) {
		const chunks = snapshot?.chunks;
		const legacy = Array.isArray(snapshot?.nodes) && Array.isArray(snapshot?.edges)
			? [{ edges: snapshot.edges, id: "legacy", nodes: snapshot.nodes }]
			: chunks;
		if (!Array.isArray(legacy))
			throw new TypeError("Invalid track graph snapshot");

		// Rebuild before replacing the live graph so a malformed persisted edge
		// cannot leave a dimension with only part of its track topology.
		const restored = new TrackGraph();
		const chunkIds = new Set();
		const edges = [];
		for (const chunk of legacy) {
			if (typeof chunk?.id !== "string" || chunkIds.has(chunk.id) || !Array.isArray(chunk.nodes) || !Array.isArray(chunk.edges))
				throw new TypeError("Invalid track graph chunk");
			chunkIds.add(chunk.id);
			for (const node of chunk.nodes)
				restored.addNode(node);
			edges.push(...chunk.edges);
		}
		for (const edge of edges)
			restored.connect(edge.leftId, edge.rightId, edge.length, edge.points);
		this.#chunks = restored.#chunks;
		this.#nodes = restored.#nodes;
		this.#edges = restored.#edges;
	}

	#isNodeAvailable(node) {
		return !!node?.trackAvailable && !!node.chunkAvailable;
	}

	#edgesFor(nodeId) {
		return [...this.#edges.values()].filter(edge => edge.leftId === nodeId || edge.rightId === nodeId);
	}
}
