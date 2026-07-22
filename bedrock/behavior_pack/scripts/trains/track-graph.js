import { normalizeTrackGeometry, persistedTrackGeometry, sampleTrackGeometry } from "./track-geometry.js";

export const TRACK_GRAPH_SCHEMA_VERSION = 2;

function edgeId(leftId, rightId) {
	return [leftId, rightId].sort().join("<->");
}

function chunkId(location) {
	return `${Math.floor(location.x / 16)}:${Math.floor(location.z / 16)}`;
}

function validatePoint(point) {
	return point && [point.x, point.y, point.z].every(Number.isFinite);
}

export class TrackGraph {
	#chunks = new Map();
	#nodes = new Map();
	#edges = new Map();
	#graphId;
	#revision = 0;

	constructor({ graphId = "default" } = {}) {
		if (typeof graphId !== "string" || graphId.length === 0)
			throw new TypeError("Track graphs require a stable id");
		this.#graphId = graphId;
	}

	addNode({ dimensionId, direction, id, location, normal }) {
		if (!id || !location)
			throw new TypeError("Track nodes require an id and location");
		if (this.#nodes.has(id))
			throw new Error(`Track node ${id} already exists`);

		const node = {
			chunkAvailable: true,
			...(dimensionId ? { dimensionId } : {}),
			...(direction ? { direction: validatePoint(direction) && { ...direction } } : {}),
			id,
			location: { ...location },
			...(normal ? { normal: validatePoint(normal) && { ...normal } } : {}),
			trackAvailable: true
		};
		if (node.direction === false || node.normal === false)
			throw new TypeError("Track node direction and normal vectors must be finite");
		this.#nodes.set(id, node);
		this.#revision++;
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

		const left = this.#nodes.get(leftId);
		const right = this.#nodes.get(rightId);
		const geometry = normalizeTrackGeometry(points, { end: right.location, legacyLength: length, start: left.location });
		length = geometry.length;

		const id = edgeId(leftId, rightId);
		if (this.#edges.has(id))
			throw new Error(`Track edge ${id} already exists`);

		this.#edges.set(id, { geometry, id, leftId, rightId, length, points: geometry.kind === "legacy_polyline" ? geometry.points : undefined, reservedBy: undefined });
		this.#revision++;
		return id;
	}

	connectGeometry(leftId, rightId, geometry) {
		return this.connect(leftId, rightId, undefined, geometry);
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
		this.#revision++;
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
			geometry: persistedTrackGeometry(edge.geometry),
			points: edge.points?.map(point => ({ ...point }))
		};
	}

	sampleEdge(id, fromNodeId, progress) {
		return this.sampleEdgeFrame(id, fromNodeId, progress).location;
	}

	sampleEdgeFrame(id, fromNodeId, progress) {
		const edge = this.#edges.get(id);
		if (!edge || (fromNodeId !== edge.leftId && fromNodeId !== edge.rightId))
			throw new Error(`Track edge ${id} is not connected to ${fromNodeId}`);
		if (!Number.isFinite(progress) || progress < 0 || progress > 1)
			throw new RangeError("Track sampling progress must be between zero and one");

		const forward = fromNodeId === edge.leftId;
		const frame = sampleTrackGeometry(edge.geometry, (forward ? progress : 1 - progress) * edge.length);
		return forward ? frame : { ...frame, tangent: { x: -frame.tangent.x, y: -frame.tangent.y, z: -frame.tangent.z } };
	}

	getNode(id) {
		const node = this.#nodes.get(id);
		return node && { available: this.#isNodeAvailable(node), ...(node.dimensionId ? { dimensionId: node.dimensionId } : {}), ...(node.direction ? { direction: { ...node.direction } } : {}), id: node.id, location: { ...node.location }, ...(node.normal ? { normal: { ...node.normal } } : {}) };
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

	getRevision() {
		return this.#revision;
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
			chunks.get(chunkId(node.location)).nodes.push({ ...(node.dimensionId ? { dimensionId: node.dimensionId } : {}), ...(node.direction ? { direction: { ...node.direction } } : {}), id: node.id, location: { ...node.location }, ...(node.normal ? { normal: { ...node.normal } } : {}) });
		for (const edge of this.#edges.values()) {
			const owner = chunks.get(chunkId(this.#nodes.get(edge.leftId).location));
			owner.edges.push({
				id: edge.id,
				leftId: edge.leftId,
				rightId: edge.rightId,
				length: edge.length,
				geometry: persistedTrackGeometry(edge.geometry),
				points: edge.points?.map(point => ({ ...point }))
			});
		}
		return {
			chunks: [...chunks.values()],
			graphId: this.#graphId,
			revision: this.#revision,
			schemaVersion: TRACK_GRAPH_SCHEMA_VERSION
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
		if (snapshot?.schemaVersion !== undefined && ![1, TRACK_GRAPH_SCHEMA_VERSION].includes(snapshot.schemaVersion))
			throw new TypeError("Unsupported track graph schema");
		const restored = new TrackGraph({ graphId: snapshot?.graphId ?? this.#graphId });
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
			restored.connect(edge.leftId, edge.rightId, edge.length, edge.geometry ?? edge.points);
		this.#chunks = restored.#chunks;
		this.#nodes = restored.#nodes;
		this.#edges = restored.#edges;
		this.#graphId = restored.#graphId;
		this.#revision = Number.isInteger(snapshot?.revision) && snapshot.revision >= 0 ? snapshot.revision : restored.#revision;
	}

	#isNodeAvailable(node) {
		return !!node?.trackAvailable && !!node.chunkAvailable;
	}

	#edgesFor(nodeId) {
		return [...this.#edges.values()].filter(edge => edge.leftId === nodeId || edge.rightId === nodeId);
	}
}
