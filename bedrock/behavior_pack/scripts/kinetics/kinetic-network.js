const EPSILON = 0.000001;

export class KineticNetwork {
	#nodes = new Map();
	#connections = new Map();

	addNode({ id, sourceSpeed = 0, stressCapacity = 0, stressImpact = 0 }) {
		if (!id)
			throw new TypeError("Kinetic nodes require a stable id");
		if (this.#nodes.has(id))
			throw new Error(`Kinetic node ${id} already exists`);

		this.#nodes.set(id, { id, sourceSpeed, stressCapacity, stressImpact });
		this.#connections.set(id, []);
	}

	connect(leftId, rightId, leftToRightRatio = 1) {
		if (!this.#nodes.has(leftId) || !this.#nodes.has(rightId))
			throw new Error("Connections require two registered kinetic nodes");
		if (leftId === rightId || !Number.isFinite(leftToRightRatio) || Math.abs(leftToRightRatio) < EPSILON)
			throw new RangeError("Kinetic connection ratio must be finite and non-zero");

		const connection = { leftId, rightId, leftToRightRatio };
		this.#connections.get(leftId).push(connection);
		this.#connections.get(rightId).push(connection);
	}

	resolve() {
		const visited = new Set();
		const resolved = [];

		for (const nodeId of this.#nodes.keys()) {
			if (visited.has(nodeId))
				continue;

			const component = this.#collectComponent(nodeId, visited);
			resolved.push(this.#resolveComponent(component));
		}

		return resolved;
	}

	#collectComponent(seedId, visited) {
		const component = [];
		const pending = [seedId];
		visited.add(seedId);

		while (pending.length > 0) {
			const nodeId = pending.shift();
			component.push(nodeId);
			for (const connection of this.#connections.get(nodeId)) {
				const adjacentId = connection.leftId === nodeId ? connection.rightId : connection.leftId;
				if (!visited.has(adjacentId)) {
					visited.add(adjacentId);
					pending.push(adjacentId);
				}
			}
		}

		return component;
	}

	#resolveComponent(component) {
		const speeds = new Map();
		const pending = [];
		let hasConflict = false;
		let stressCapacity = 0;
		let stressImpact = 0;

		for (const nodeId of component) {
			const node = this.#nodes.get(nodeId);
			stressImpact += node.stressImpact;
			if (Math.abs(node.sourceSpeed) >= EPSILON) {
				stressCapacity += node.stressCapacity;
				speeds.set(nodeId, node.sourceSpeed);
				pending.push(nodeId);
			}
		}

		while (pending.length > 0) {
			const nodeId = pending.shift();
			const nodeSpeed = speeds.get(nodeId);
			for (const connection of this.#connections.get(nodeId)) {
				const isLeft = connection.leftId === nodeId;
				const adjacentId = isLeft ? connection.rightId : connection.leftId;
				const expectedSpeed = isLeft
					? nodeSpeed * connection.leftToRightRatio
					: nodeSpeed / connection.leftToRightRatio;
				const knownSpeed = speeds.get(adjacentId);

				if (knownSpeed === undefined) {
					speeds.set(adjacentId, expectedSpeed);
					pending.push(adjacentId);
				} else if (Math.abs(knownSpeed - expectedSpeed) >= EPSILON) {
					hasConflict = true;
				}
			}
		}

		const overloaded = stressImpact > stressCapacity + EPSILON;
		const stalled = hasConflict || overloaded || stressCapacity === 0;
		const nodeIds = [...component].sort();
		const nodeStates = nodeIds.map(id => ({
			id,
			requestedSpeed: speeds.get(id) ?? 0,
			speed: stalled ? 0 : speeds.get(id) ?? 0
		}));

		return {
			nodeIds,
			stressCapacity,
			stressImpact,
			overloaded,
			hasConflict,
			stalled,
			nodeStates
		};
	}
}
