import { KineticNetwork } from "./kinetic-network.js";

export const KINETIC_BLOCKS = {
	"createbedrock:hand_crank": {
		kind: "source",
		axis: "y",
		stressCapacity: 32,
		turnSpeed: 16
	},
	"createbedrock:shaft": {
		kind: "transmission",
		axis: "y"
	},
	"createbedrock:cogwheel": {
		kind: "small_cogwheel",
		axis: "y"
	},
	"createbedrock:large_cogwheel": {
		kind: "large_cogwheel",
		axis: "y"
	},
	"createbedrock:gearbox": {
		kind: "gearbox",
		axes: ["x", "y", "z"],
		axis: "y"
	},
	"createbedrock:millstone": {
		kind: "consumer",
		axis: "y",
		stressImpact: 8
	},
	"createbedrock:mechanical_bearing": {
		kind: "consumer",
		axis: "y",
		stressImpact: 8
	},
	"createbedrock:mechanical_press": {
		kind: "consumer",
		axis: "y",
		stressImpact: 8
	},
	"createbedrock:crushing_wheel": {
		kind: "consumer",
		axis: "y",
		stressImpact: 8
	}
};

const NEIGHBOR_OFFSETS = [
	[1, 0, 0],
	[-1, 0, 0],
	[0, 1, 0],
	[0, -1, 0],
	[0, 0, 1],
	[0, 0, -1]
];

function axisOfOffset(x, y, z) {
	return x !== 0 ? "x" : y !== 0 ? "y" : z !== 0 ? "z" : undefined;
}

function axisFor(block, configuration) {
	const states = block.permutation?.getAllStates?.() ?? {};
	const facing = states["minecraft:facing_direction"];
	const facingAxis = ({ 0: "y", 1: "y", 2: "z", 3: "z", 4: "x", 5: "x", north: "z", south: "z", east: "x", west: "x", up: "y", down: "y" })[facing];
	const axis = facingAxis ?? states["createbedrock:axis"] ?? configuration.axis;
	return ["x", "y", "z"].includes(axis) ? axis : configuration.axis;
}

function connectionRatio(left, right, x, y, z) {
	const directionAxis = axisOfOffset(x, y, z);
	if (!directionAxis)
		return undefined;
	const cogwheels = new Set(["small_cogwheel", "large_cogwheel"]);
	if (cogwheels.has(left.configuration.kind) && cogwheels.has(right.configuration.kind)) {
		if (left.axis !== right.axis || directionAxis === left.axis)
			return undefined;
		if (left.configuration.kind === right.configuration.kind)
			return -1;
		return left.configuration.kind === "large_cogwheel" ? -2 : -0.5;
	}
	const supportsAxis = node => node.configuration.axes?.includes(directionAxis) || node.axis === directionAxis;
	return supportsAxis(left) && supportsAxis(right) ? 1 : undefined;
}

function keyFor(dimensionId, location) {
	return `${dimensionId}:${location.x}:${location.y}:${location.z}`;
}

export class KineticWorld {
	#nodes = new Map();
	#dirty = false;
	#lastResolved = [];

	trackPlacedBlock(block) {
		const configuration = KINETIC_BLOCKS[block.typeId];
		if (!configuration)
			return false;

		const id = keyFor(block.dimension.id, block.location);
		this.#nodes.set(id, {
			axis: axisFor(block, configuration),
			configuration,
			dimensionId: block.dimension.id,
			id,
			location: { ...block.location },
			turnTicksRemaining: 0,
			typeId: block.typeId
		});
		this.#dirty = true;
		return true;
	}

	trackBrokenBlock(dimensionId, location) {
		const deleted = this.#nodes.delete(keyFor(dimensionId, location));
		this.#dirty ||= deleted;
		return deleted;
	}

	snapshot() {
		return [...this.#nodes.values()]
			.map(node => ({
				axis: node.axis,
				dimensionId: node.dimensionId,
				location: node.location,
				typeId: node.typeId
			}))
			.sort((left, right) => keyFor(left.dimensionId, left.location).localeCompare(keyFor(right.dimensionId, right.location)));
	}

	restore(snapshot) {
		if (!Array.isArray(snapshot))
			throw new TypeError("Kinetic world snapshots must be arrays");

		this.#nodes.clear();
		for (const entry of snapshot) {
			const configuration = KINETIC_BLOCKS[entry?.typeId];
			const location = entry?.location;
			if (!configuration || !entry?.dimensionId || !Number.isInteger(location?.x) || !Number.isInteger(location?.y) || !Number.isInteger(location?.z))
				continue;
			const axis = ["x", "y", "z"].includes(entry.axis) ? entry.axis : configuration.axis;

			const id = keyFor(entry.dimensionId, location);
			this.#nodes.set(id, {
				axis,
				configuration,
				dimensionId: entry.dimensionId,
				id,
				location: { ...location },
				turnTicksRemaining: 0,
				typeId: entry.typeId
			});
		}

		this.#dirty = true;
	}

	activateHandCrank(block, duration = 20) {
		const node = this.#nodes.get(keyFor(block.dimension.id, block.location));
		if (!node || node.typeId !== "createbedrock:hand_crank")
			return false;

		node.turnTicksRemaining = Math.max(node.turnTicksRemaining, duration);
		this.#dirty = true;
		return true;
	}

	tick() {
		for (const node of this.#nodes.values()) {
			if (node.turnTicksRemaining <= 0)
				continue;

			node.turnTicksRemaining--;
			if (node.turnTicksRemaining === 0)
				this.#dirty = true;
		}

		if (!this.#dirty)
			return;

		this.#dirty = false;
		this.#lastResolved = this.#resolve();
	}

	get latestResolved() {
		return this.#lastResolved;
	}

	speedAt(dimensionId, location) {
		const id = keyFor(dimensionId, location);
		for (const network of this.#lastResolved) {
			const node = network.nodeStates.find(state => state.id === id);
			if (node)
				return node.speed;
		}
		return 0;
	}

	#resolve() {
		const network = new KineticNetwork();
		for (const node of this.#nodes.values()) {
			const isTurning = node.turnTicksRemaining > 0;
			network.addNode({
				id: node.id,
				sourceSpeed: isTurning ? node.configuration.turnSpeed ?? 0 : 0,
				stressCapacity: isTurning ? node.configuration.stressCapacity ?? 0 : 0,
				stressImpact: node.configuration.stressImpact ?? 0
			});
		}

		for (const node of this.#nodes.values()) {
			for (const [x, y, z] of NEIGHBOR_OFFSETS) {
				const adjacentId = keyFor(node.dimensionId, {
					x: node.location.x + x,
					y: node.location.y + y,
					z: node.location.z + z
				});
				const adjacent = this.#nodes.get(adjacentId);
				if (!adjacent || node.id >= adjacent.id)
					continue;

				const ratio = connectionRatio(node, adjacent, x, y, z);
				if (ratio !== undefined)
					network.connect(node.id, adjacent.id, ratio);
			}
		}

		return network.resolve();
	}
}
