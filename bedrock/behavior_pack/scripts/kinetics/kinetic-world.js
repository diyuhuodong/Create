import { KineticNetwork } from "./kinetic-network.js";

export const KINETIC_BLOCKS = {
	"createbedrock:hand_crank": {
		kind: "source",
		axis: "y",
		stressCapacity: 32,
		turnSpeed: 16
	},
	"createbedrock:water_wheel": {
		kind: "generated_source",
		axis: "y",
		generatedSpeed: 8,
		stressCapacity: 64
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
	"createbedrock:clutch": {
		kind: "clutch",
		axis: "y"
	},
	"createbedrock:encased_chain_drive": {
		kind: "chain_drive",
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

// Mirrors Create's default `kinetics.maxBeltLength` server configuration.  A
// future Bedrock settings UI can make this configurable without changing the
// persisted link format.
export const MAX_BELT_LENGTH = 20;

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

function enabledFor(block, configuration) {
	if (configuration.kind !== "clutch")
		return true;
	const value = block.permutation?.getAllStates?.()["createbedrock:enabled"];
	return value !== 0 && value !== false;
}

function connectionRatio(left, right, x, y, z) {
	if (!left.enabled || !right.enabled)
		return undefined;
	const directionAxis = axisOfOffset(x, y, z);
	if (!directionAxis)
		return undefined;
	if (left.configuration.kind === "chain_drive" && right.configuration.kind === "chain_drive") {
		const chainAxis = axis => ({ x: "z", y: "z", z: "y" })[axis];
		return left.axis === right.axis && directionAxis === chainAxis(left.axis) ? 1 : undefined;
	}
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

function linkKey(leftId, rightId) {
	return [leftId, rightId].sort().join("|");
}

function isBeltPulley(node) {
	return node?.configuration.kind === "transmission";
}

function isValidBeltPath(left, right) {
	if (!isBeltPulley(left) || !isBeltPulley(right) || left.axis !== right.axis)
		return false;

	const delta = {
		x: right.location.x - left.location.x,
		y: right.location.y - left.location.y,
		z: right.location.z - left.location.z
	};
	const distance = Math.hypot(delta.x, delta.y, delta.z);
	if (distance === 0 || distance > MAX_BELT_LENGTH || delta[left.axis] !== 0)
		return false;

	const x = Math.abs(delta.x);
	const y = Math.abs(delta.y);
	const z = Math.abs(delta.z);
	const equalPairs = Number(x === y) + Number(y === z) + Number(z === x);
	if (equalPairs !== 1)
		return false;

	// Vertical shafts only support a straight horizontal belt.  Horizontal
	// shafts may additionally form the 45-degree slopes supported by Create.
	return left.axis !== "y" || delta.x === 0 || delta.z === 0;
}

export class KineticWorld {
	#nodes = new Map();
	#beltLinks = new Map();
	#dirty = false;
	#lastResolved = [];

	trackPlacedBlock(block) {
		const configuration = KINETIC_BLOCKS[block.typeId];
		if (!configuration)
			return false;

		const id = keyFor(block.dimension.id, block.location);
		const previous = this.#nodes.get(id);
		this.#nodes.set(id, {
			axis: axisFor(block, configuration),
			configuration,
			dimensionId: block.dimension.id,
			enabled: enabledFor(block, configuration),
			id,
			location: { ...block.location },
			generatedSpeed: previous?.generatedSpeed ?? 0,
			turnTicksRemaining: previous?.turnTicksRemaining ?? 0,
			typeId: block.typeId
		});
		this.#dirty = true;
		return true;
	}

	trackBrokenBlock(dimensionId, location) {
		const id = keyFor(dimensionId, location);
		const deleted = this.#nodes.delete(id);
		let removedLinks = false;
		for (const [linkId, link] of this.#beltLinks) {
			if (link.leftId !== id && link.rightId !== id)
				continue;
			this.#beltLinks.delete(linkId);
			removedLinks = true;
		}
		this.#dirty ||= deleted || removedLinks;
		return deleted || removedLinks;
	}

	snapshot() {
		const nodes = [...this.#nodes.values()]
			.map(node => ({
				axis: node.axis,
				dimensionId: node.dimensionId,
				...(node.configuration.kind === "clutch" ? { enabled: node.enabled } : {}),
				...(node.configuration.kind === "generated_source" ? { generatedSpeed: node.generatedSpeed } : {}),
				location: node.location,
				typeId: node.typeId
			}))
			.sort((left, right) => keyFor(left.dimensionId, left.location).localeCompare(keyFor(right.dimensionId, right.location)));
		const beltLinks = [...this.#beltLinks.values()]
			.map(link => ({
				left: { dimensionId: link.left.dimensionId, location: link.left.location },
				right: { dimensionId: link.right.dimensionId, location: link.right.location }
			}))
			.sort((left, right) => keyFor(left.left.dimensionId, left.left.location).localeCompare(keyFor(right.left.dimensionId, right.left.location)));
		return { beltLinks, nodes, schemaVersion: 2 };
	}

	restore(snapshot) {
		const nodes = Array.isArray(snapshot) ? snapshot : snapshot?.nodes;
		const beltLinks = Array.isArray(snapshot) ? [] : snapshot?.beltLinks ?? [];
		if (!Array.isArray(nodes) || !Array.isArray(beltLinks))
			throw new TypeError("Kinetic world snapshots must provide node and belt-link arrays");

		this.#nodes.clear();
		this.#beltLinks.clear();
		for (const entry of nodes) {
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
				enabled: configuration.kind !== "clutch" || entry.enabled !== false,
				id,
				generatedSpeed: configuration.kind === "generated_source" && Number.isFinite(entry.generatedSpeed) ? entry.generatedSpeed : 0,
				location: { ...location },
				turnTicksRemaining: 0,
				typeId: entry.typeId
			});
		}

		for (const link of beltLinks) {
			const left = link?.left;
			const right = link?.right;
			if (!left?.dimensionId || left.dimensionId !== right?.dimensionId || !left.location || !right.location)
				continue;
			this.connectBelt(left.dimensionId, left.location, right.location);
		}

		this.#dirty = true;
	}

	getGeneratedSourceNodes(typeId) {
		return [...this.#nodes.values()]
			.filter(node => node.typeId === typeId && node.configuration.kind === "generated_source")
			.map(node => ({ axis: node.axis, dimensionId: node.dimensionId, location: { ...node.location } }));
	}

	setGeneratedSpeed(dimensionId, location, speed) {
		if (!Number.isFinite(speed))
			throw new TypeError("Generated kinetic speeds must be finite");
		const node = this.#nodes.get(keyFor(dimensionId, location));
		if (!node || node.configuration.kind !== "generated_source")
			return false;
		if (node.generatedSpeed === speed)
			return false;
		node.generatedSpeed = speed;
		this.#dirty = true;
		return true;
	}

	isBeltPulley(dimensionId, location) {
		return isBeltPulley(this.#nodes.get(keyFor(dimensionId, location)));
	}

	connectBelt(dimensionId, leftLocation, rightLocation) {
		const leftId = keyFor(dimensionId, leftLocation);
		const rightId = keyFor(dimensionId, rightLocation);
		const left = this.#nodes.get(leftId);
		const right = this.#nodes.get(rightId);
		if (!left || !right)
			return { ok: false, reason: "missing_pulley" };
		if (!isValidBeltPath(left, right))
			return { ok: false, reason: "invalid_path" };

		const id = linkKey(leftId, rightId);
		if (this.#beltLinks.has(id))
			return { ok: false, reason: "already_connected" };

		this.#beltLinks.set(id, {
			left: { dimensionId, location: { ...left.location } },
			leftId,
			right: { dimensionId, location: { ...right.location } },
			rightId
		});
		this.#dirty = true;
		return { ok: true };
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
		const connectedPairs = new Set();
		const connect = (leftId, rightId, ratio) => {
			const id = linkKey(leftId, rightId);
			if (connectedPairs.has(id))
				return;
			connectedPairs.add(id);
			network.connect(leftId, rightId, ratio);
		};
		for (const node of this.#nodes.values()) {
			const isTurning = node.turnTicksRemaining > 0;
			const sourceSpeed = node.configuration.kind === "generated_source"
				? node.generatedSpeed
				: isTurning ? node.configuration.turnSpeed ?? 0 : 0;
			const stressCapacity = node.configuration.kind === "generated_source"
				? Math.abs(sourceSpeed) > 0 ? node.configuration.stressCapacity ?? 0 : 0
				: isTurning ? node.configuration.stressCapacity ?? 0 : 0;
			network.addNode({
				id: node.id,
				sourceSpeed,
				stressCapacity,
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
					connect(node.id, adjacent.id, ratio);
			}
		}

		for (const link of this.#beltLinks.values()) {
			if (this.#nodes.has(link.leftId) && this.#nodes.has(link.rightId))
				connect(link.leftId, link.rightId, 1);
		}

		return network.resolve();
	}
}
