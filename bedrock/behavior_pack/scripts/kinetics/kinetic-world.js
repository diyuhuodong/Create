import { KineticNetwork } from "./kinetic-network.js";
import { WorldIndex, worldLocationKey } from "../kernel/world-index.js";

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
		stressCapacity: 64,
		waterDriven: true
	},
	"createbedrock:large_water_wheel": {
		kind: "generated_source",
		axis: "y",
		generatedSpeed: 4,
		stressCapacity: 128,
		waterDriven: true,
		waterRadius: 2
	},
	"createbedrock:creative_motor": {
		kind: "configurable_source",
		axis: "y",
		defaultSpeed: 16,
		maxSpeed: 256,
		stressCapacity: 16384
	},
	"createbedrock:rotation_speed_controller": {
		// A controller has an axial input and an output through the perpendicular
		// large cog directly above it. It is deliberately not a source: #resolve
		// transfers only spare capacity from the powered side to the target side.
		kind: "speed_controller",
		axis: "x",
		defaultSpeed: 16,
		maxSpeed: 256
	},
	"createbedrock:shaft": {
		kind: "transmission",
		axis: "y"
	},
	"createbedrock:andesite_encased_shaft": {
		kind: "transmission",
		axis: "y"
	},
	"createbedrock:brass_encased_shaft": {
		kind: "transmission",
		axis: "y"
	},
	"createbedrock:metal_girder_encased_shaft": {
		kind: "transmission",
		axis: "y"
	},
	"createbedrock:flywheel": {
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
	"createbedrock:andesite_encased_cogwheel": {
		kind: "small_cogwheel",
		axis: "y"
	},
	"createbedrock:brass_encased_cogwheel": {
		kind: "small_cogwheel",
		axis: "y"
	},
	"createbedrock:encased_cogwheel": {
		kind: "small_cogwheel",
		axis: "y"
	},
	"createbedrock:andesite_encased_large_cogwheel": {
		kind: "large_cogwheel",
		axis: "y"
	},
	"createbedrock:brass_encased_large_cogwheel": {
		kind: "large_cogwheel",
		axis: "y"
	},
	"createbedrock:encased_large_cogwheel": {
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
	"createbedrock:gearshift": {
		kind: "gearshift",
		axis: "y"
	},
	"createbedrock:encased_chain_drive": {
		kind: "chain_drive",
		axis: "y"
	},
	"createbedrock:adjustable_chain_gearshift": {
		kind: "chain_gearshift",
		axis: "y"
	},
	"createbedrock:chain_conveyor": {
		kind: "consumer",
		axis: "y",
		stressImpact: 8
	},
	"createbedrock:belt": {
		kind: "consumer",
		axis: "y",
		stressImpact: 8
	},
	"createbedrock:powered_shaft": {
		kind: "external_source",
		axis: "y",
		stressCapacity: 0
	},
	"createbedrock:sequenced_gearshift": {
		kind: "sequenced_gearshift",
		axis: "y"
	},
	"createbedrock:steam_engine": {
		// The engine itself consumes fluid and writes its output to a powered
		// shaft. It is deliberately not a physical kinetic connector.
		kind: "machine",
		axis: "y"
	},
	"createbedrock:windmill_bearing": {
		kind: "generated_source",
		axis: "y",
		stressCapacity: 128
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
	},
	"createbedrock:encased_fan": {
		kind: "consumer",
		axis: "y",
		stressImpact: 4
	},
	"createbedrock:mechanical_mixer": {
		kind: "consumer",
		axis: "y",
		stressImpact: 8
	},
	"createbedrock:mechanical_saw": {
		kind: "consumer",
		axis: "y",
		stressImpact: 8
	},
	"createbedrock:mechanical_pump": {
		kind: "consumer",
		axis: "y",
		stressImpact: 4
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

function redstoneSignalFor(block, configuration) {
	if (configuration.kind !== "chain_gearshift")
		return 0;
	const signal = block.permutation?.getAllStates?.()["createbedrock:signal"];
	return Number.isInteger(signal) && signal >= 0 && signal <= 15 ? signal : 0;
}

function reversedFor(block, configuration) {
	if (configuration.kind !== "gearshift" && configuration.kind !== "sequenced_gearshift")
		return false;
	const powered = block.permutation?.getAllStates?.()["createbedrock:powered"];
	return powered !== 0 && powered !== false && powered !== undefined;
}

function isGeneratedSource(configuration) {
	return configuration.kind === "generated_source"
		|| configuration.kind === "configurable_source"
		|| configuration.kind === "external_source";
}

function isSplitGearshift(configuration) {
	return configuration.kind === "gearshift" || configuration.kind === "sequenced_gearshift";
}

function isSpeedController(configuration) {
	return configuration.kind === "speed_controller";
}

function speedControllerPortId(node, side) {
	return `${node.id}:speed_controller:${side}`;
}

function isSpeedControllerOutput(controller, adjacent) {
	return isSpeedController(controller.configuration)
		&& adjacent.configuration.kind === "large_cogwheel"
		&& controller.axis !== "y"
		&& adjacent.axis !== "y"
		&& controller.axis !== adjacent.axis
		&& adjacent.location.x === controller.location.x
		&& adjacent.location.y === controller.location.y + 1
		&& adjacent.location.z === controller.location.z;
}

function speedControllerPortFor(controller, adjacent) {
	if (isSpeedControllerOutput(controller, adjacent))
		return speedControllerPortId(controller, "output");
	const directionAxis = axisOfOffset(
		adjacent.location.x - controller.location.x,
		adjacent.location.y - controller.location.y,
		adjacent.location.z - controller.location.z
	);
	return directionAxis === controller.axis ? speedControllerPortId(controller, "input") : undefined;
}

function normalizeSequence(program) {
	if (!Array.isArray(program) || program.length === 0 || program.length > 16)
		throw new RangeError("Sequenced gearshift programs require one to sixteen steps");
	return program.map((step, index) => {
		if (!step || !Number.isFinite(step.multiplier) || Math.abs(step.multiplier) > 256
			|| !Number.isInteger(step.duration) || step.duration < 1 || step.duration > 1200)
			throw new RangeError(`Invalid sequenced gearshift step ${index}`);
		return { duration: step.duration, multiplier: step.multiplier };
	});
}

function defaultSequence() {
	return [{ duration: 20, multiplier: 1 }, { duration: 20, multiplier: -1 }];
}

function sequenceFor(entry) {
	try {
		return normalizeSequence(entry?.program ?? defaultSequence());
	} catch {
		return defaultSequence();
	}
}

function chainSpeedModifier(node) {
	if (node.configuration.kind !== "chain_gearshift")
		return 1;
	return node.chainSignal === 0 ? 1 : 1 + ((node.chainSignal + 1) / 16);
}

function connectionRatio(left, right, x, y, z) {
	if (!left.enabled || !right.enabled)
		return undefined;
	const directionAxis = axisOfOffset(x, y, z);
	if (!directionAxis)
		return undefined;
	const controller = isSpeedController(left.configuration) ? left
		: isSpeedController(right.configuration) ? right : undefined;
	if (controller) {
		const adjacent = controller === left ? right : left;
		return speedControllerPortFor(controller, adjacent) ? 1 : undefined;
	}
	const chainDrives = new Set(["chain_drive", "chain_gearshift"]);
	if (chainDrives.has(left.configuration.kind) && chainDrives.has(right.configuration.kind)) {
		const chainAxis = axis => ({ x: "z", y: "z", z: "y" })[axis];
		return left.axis === right.axis && directionAxis === chainAxis(left.axis)
			? chainSpeedModifier(left) / chainSpeedModifier(right)
			: undefined;
	}
	const cogwheels = new Set(["small_cogwheel", "large_cogwheel"]);
	if (cogwheels.has(left.configuration.kind) && cogwheels.has(right.configuration.kind)) {
		if (left.axis !== right.axis || directionAxis === left.axis)
			return undefined;
		if (left.configuration.kind === right.configuration.kind)
			return -1;
		return left.configuration.kind === "large_cogwheel" ? -2 : -0.5;
	}
	const supportsAxis = node => node.configuration.kind !== "machine"
		&& (node.configuration.axes?.includes(directionAxis) || node.axis === directionAxis);
	return supportsAxis(left) && supportsAxis(right) ? 1 : undefined;
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
	#nodes = new WorldIndex();
	#connections = new Map();
	#beltLinks = new Map();
	#dirtyDimensions = new Set();
	#persistenceDirty = false;
	#resolvedByDimension = new Map();

	trackPlacedBlock(block) {
		const configuration = KINETIC_BLOCKS[block.typeId];
		if (!configuration)
			return false;

		const id = worldLocationKey(block.dimension.id, block.location);
		const previous = this.#nodes.get(block.dimension.id, block.location);
		this.#nodes.set(block.dimension.id, block.location, {
			axis: axisFor(block, configuration),
			configuration,
			dimensionId: block.dimension.id,
			enabled: enabledFor(block, configuration),
			id,
			location: { ...block.location },
			chainSignal: configuration.kind === "chain_gearshift" ? previous?.chainSignal ?? redstoneSignalFor(block, configuration) : 0,
			generatedSpeed: configuration.kind === "configurable_source"
				? previous?.generatedSpeed ?? configuration.defaultSpeed
				: previous?.generatedSpeed ?? 0,
			targetSpeed: isSpeedController(configuration)
				? previous?.targetSpeed ?? configuration.defaultSpeed
				: 0,
			sourceCapacity: configuration.kind === "external_source" ? previous?.sourceCapacity ?? 0 : 0,
			reversed: isSplitGearshift(configuration) ? previous?.reversed ?? reversedFor(block, configuration) : false,
			sequence: configuration.kind === "sequenced_gearshift"
				? previous?.sequence ?? { active: false, program: defaultSequence(), step: 0, ticksRemaining: 0 }
				: undefined,
			turnTicksRemaining: previous?.turnTicksRemaining ?? 0,
			typeId: block.typeId
		});
		this.#refreshConnectionsAt(block.dimension.id, block.location);
		this.#markDirty(block.dimension.id);
		this.#persistenceDirty = true;
		return true;
	}

	trackBrokenBlock(dimensionId, location) {
		const id = worldLocationKey(dimensionId, location);
		const deleted = this.#nodes.delete(dimensionId, location);
		if (deleted)
			this.#removeConnectionsFor(id);
		let removedLinks = false;
		for (const [linkId, link] of this.#beltLinks) {
			if (link.leftId !== id && link.rightId !== id)
				continue;
			this.#beltLinks.delete(linkId);
			removedLinks = true;
		}
		if (deleted || removedLinks) {
			this.#markDirty(dimensionId);
			this.#persistenceDirty = true;
		}
		return deleted || removedLinks;
	}

	/** Capture exactly one configured node for a moving-block data adapter. */
	captureNode(dimensionId, location) {
		if (typeof dimensionId !== "string" || !Number.isInteger(location?.x) || !Number.isInteger(location?.y) || !Number.isInteger(location?.z))
			throw new TypeError("Kinetic node capture requires a dimension and integer location");
		return this.snapshot().nodes.find(node => node.dimensionId === dimensionId
			&& node.location.x === location.x && node.location.y === location.y && node.location.z === location.z);
	}

	/**
	 * Reinstates one captured node without replacing unrelated world state. Any
	 * belt attachment is restored separately from the assembly attachment record.
	 */
	restoreCapturedNode(node) {
		if (!node?.dimensionId || !KINETIC_BLOCKS[node.typeId]
			|| !Number.isInteger(node.location?.x) || !Number.isInteger(node.location?.y) || !Number.isInteger(node.location?.z))
			throw new TypeError("Captured kinetic nodes require a known type and integer world location");
		const current = this.snapshot();
		const sameLocation = candidate => candidate.dimensionId === node.dimensionId
			&& candidate.location.x === node.location.x && candidate.location.y === node.location.y && candidate.location.z === node.location.z;
		const nodes = current.nodes.filter(candidate => !sameLocation(candidate));
		nodes.push({ ...node, location: { ...node.location } });
		const beltLinks = current.beltLinks.filter(link => !sameLocation(link.left) && !sameLocation(link.right));
		this.restore({ beltLinks, nodes });
		this.#persistenceDirty = true;
		return true;
	}

	snapshot() {
		const nodes = [...this.#nodes.values()]
			.map(node => ({
				axis: node.axis,
				dimensionId: node.dimensionId,
				...(node.configuration.kind === "clutch" ? { enabled: node.enabled } : {}),
				...(isGeneratedSource(node.configuration)
					? { generatedSpeed: node.generatedSpeed }
					: {}),
				...(isSpeedController(node.configuration) ? { targetSpeed: node.targetSpeed } : {}),
				...(node.configuration.kind === "external_source" && node.sourceCapacity > 0 ? { sourceCapacity: node.sourceCapacity } : {}),
				...(node.configuration.kind === "chain_gearshift" && node.chainSignal > 0 ? { chainSignal: node.chainSignal } : {}),
				...(isSplitGearshift(node.configuration) && node.reversed ? { reversed: true } : {}),
				...(node.configuration.kind === "sequenced_gearshift" ? { sequence: node.sequence } : {}),
				...(node.configuration.kind === "source" && node.turnTicksRemaining > 0
					? { turnTicksRemaining: node.turnTicksRemaining }
					: {}),
				location: node.location,
				typeId: node.typeId
			}))
			.sort((left, right) => worldLocationKey(left.dimensionId, left.location).localeCompare(worldLocationKey(right.dimensionId, right.location)));
		const beltLinks = [...this.#beltLinks.values()]
			.map(link => ({
				left: { dimensionId: link.left.dimensionId, location: link.left.location },
				right: { dimensionId: link.right.dimensionId, location: link.right.location }
			}))
			.sort((left, right) => worldLocationKey(left.left.dimensionId, left.left.location).localeCompare(worldLocationKey(right.left.dimensionId, right.left.location)));
		return { beltLinks, nodes, schemaVersion: 2 };
	}

	restore(snapshot) {
		const nodes = Array.isArray(snapshot) ? snapshot : snapshot?.nodes;
		const beltLinks = Array.isArray(snapshot) ? [] : snapshot?.beltLinks ?? [];
		if (!Array.isArray(nodes) || !Array.isArray(beltLinks))
			throw new TypeError("Kinetic world snapshots must provide node and belt-link arrays");

		this.#nodes.clear();
		this.#connections.clear();
		this.#beltLinks.clear();
		this.#dirtyDimensions.clear();
		this.#resolvedByDimension.clear();
		for (const entry of nodes) {
			const configuration = KINETIC_BLOCKS[entry?.typeId];
			const location = entry?.location;
			if (!configuration || !entry?.dimensionId || !Number.isInteger(location?.x) || !Number.isInteger(location?.y) || !Number.isInteger(location?.z))
				continue;
			const axis = ["x", "y", "z"].includes(entry.axis) ? entry.axis : configuration.axis;

			const id = worldLocationKey(entry.dimensionId, location);
			this.#nodes.set(entry.dimensionId, location, {
				axis,
				configuration,
				dimensionId: entry.dimensionId,
				enabled: configuration.kind !== "clutch" || entry.enabled !== false,
				id,
				chainSignal: configuration.kind === "chain_gearshift" && Number.isInteger(entry.chainSignal)
					&& entry.chainSignal >= 0 && entry.chainSignal <= 15 ? entry.chainSignal : 0,
				generatedSpeed: configuration.kind === "configurable_source"
					? Number.isFinite(entry.generatedSpeed) && Math.abs(entry.generatedSpeed) <= configuration.maxSpeed
						? entry.generatedSpeed : configuration.defaultSpeed
					: isGeneratedSource(configuration) && Number.isFinite(entry.generatedSpeed) ? entry.generatedSpeed : 0,
				targetSpeed: isSpeedController(configuration)
					&& Number.isFinite(entry.targetSpeed) && Math.abs(entry.targetSpeed) <= configuration.maxSpeed
					? entry.targetSpeed : configuration.defaultSpeed,
				location: { ...location },
				sourceCapacity: configuration.kind === "external_source" && Number.isFinite(entry.sourceCapacity) && entry.sourceCapacity >= 0
					? entry.sourceCapacity : 0,
				reversed: isSplitGearshift(configuration) && entry.reversed === true,
				sequence: configuration.kind === "sequenced_gearshift" ? {
					active: entry.sequence?.active === true,
					program: sequenceFor(entry.sequence),
					step: Number.isInteger(entry.sequence?.step) && entry.sequence.step >= 0 ? entry.sequence.step % sequenceFor(entry.sequence).length : 0,
					ticksRemaining: Number.isInteger(entry.sequence?.ticksRemaining) && entry.sequence.ticksRemaining > 0 ? entry.sequence.ticksRemaining : 0
				} : undefined,
				turnTicksRemaining: configuration.kind === "source"
					&& Number.isInteger(entry.turnTicksRemaining)
					&& entry.turnTicksRemaining > 0
					? entry.turnTicksRemaining
					: 0,
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
		this.#rebuildConnections();
		for (const node of this.#nodes.values())
			this.#markDirty(node.dimensionId);
		this.#persistenceDirty = false;
	}

	getWaterDrivenSourceNodes() {
		return [...this.#nodes.values()]
			.filter(node => node.configuration.waterDriven)
			.map(node => ({
				axis: node.axis,
				dimensionId: node.dimensionId,
				location: { ...node.location },
				typeId: node.typeId,
				waterRadius: node.configuration.waterRadius ?? 1
			}));
	}

	getNodesByType(typeId) {
		if (typeof typeId !== "string")
			throw new TypeError("Kinetic node lookup requires a block identifier");
		return [...this.#nodes.values()]
			.filter(node => node.typeId === typeId)
			.map(node => ({
				axis: node.axis,
				dimensionId: node.dimensionId,
				location: { ...node.location },
				typeId: node.typeId
			}));
	}

	setGeneratedSpeed(dimensionId, location, speed) {
		if (!Number.isFinite(speed))
			throw new TypeError("Generated kinetic speeds must be finite");
		const node = this.#nodes.get(dimensionId, location);
		if (!node || !isGeneratedSource(node.configuration))
			return false;
		if (node.configuration.kind === "configurable_source" && Math.abs(speed) > node.configuration.maxSpeed)
			throw new RangeError(`Generated speed must be between ${-node.configuration.maxSpeed} and ${node.configuration.maxSpeed}`);
		if (node.generatedSpeed === speed)
			return false;
		node.generatedSpeed = speed;
		this.#markDirty(dimensionId);
		this.#persistenceDirty = true;
		return true;
	}

	setSpeedControllerTarget(dimensionId, location, speed) {
		if (!Number.isFinite(speed))
			throw new TypeError("Rotation Speed Controller targets must be finite");
		const node = this.#nodes.get(dimensionId, location);
		if (!node || !isSpeedController(node.configuration))
			return false;
		if (Math.abs(speed) > node.configuration.maxSpeed)
			throw new RangeError(`Rotation Speed Controller target must be between ${-node.configuration.maxSpeed} and ${node.configuration.maxSpeed}`);
		if (node.targetSpeed === speed)
			return false;
		node.targetSpeed = speed;
		this.#markDirty(dimensionId);
		this.#persistenceDirty = true;
		return true;
	}

	speedControllerTargetAt(dimensionId, location) {
		const node = this.#nodes.get(dimensionId, location);
		return node && isSpeedController(node.configuration) ? node.targetSpeed : 0;
	}

	generatedSpeedAt(dimensionId, location) {
		const node = this.#nodes.get(dimensionId, location);
		return node && isGeneratedSource(node.configuration)
			? node.generatedSpeed
			: 0;
	}

	setExternalSource(dimensionId, location, { capacity, speed }) {
		if (!Number.isFinite(speed) || !Number.isFinite(capacity) || capacity < 0)
			throw new TypeError("External kinetic sources require finite speed and non-negative capacity");
		const node = this.#nodes.get(dimensionId, location);
		if (!node || node.configuration.kind !== "external_source")
			return false;
		if (node.generatedSpeed === speed && node.sourceCapacity === capacity)
			return false;
		node.generatedSpeed = speed;
		node.sourceCapacity = capacity;
		this.#markDirty(dimensionId);
		this.#persistenceDirty = true;
		return true;
	}

	setClutchEnabled(dimensionId, location, enabled) {
		if (typeof enabled !== "boolean")
			throw new TypeError("Clutch enabled state must be boolean");
		const node = this.#nodes.get(dimensionId, location);
		if (!node || node.configuration.kind !== "clutch" || node.enabled === enabled)
			return false;
		node.enabled = enabled;
		this.#refreshConnectionsAt(dimensionId, location);
		this.#markDirty(dimensionId);
		this.#persistenceDirty = true;
		return true;
	}

	setGearshiftReversed(dimensionId, location, reversed) {
		if (typeof reversed !== "boolean")
			throw new TypeError("Gearshift reversal state must be boolean");
		const node = this.#nodes.get(dimensionId, location);
		if (!node || !isSplitGearshift(node.configuration) || node.reversed === reversed)
			return false;
		node.reversed = reversed;
		this.#markDirty(dimensionId);
		this.#persistenceDirty = true;
		return true;
	}

	configureSequencedGearshift(dimensionId, location, program) {
		const node = this.#nodes.get(dimensionId, location);
		if (!node || node.configuration.kind !== "sequenced_gearshift")
			return false;
		const normalized = normalizeSequence(program);
		if (JSON.stringify(node.sequence.program) === JSON.stringify(normalized))
			return false;
		node.sequence = { active: false, program: normalized, step: 0, ticksRemaining: 0 };
		this.#markDirty(dimensionId);
		this.#persistenceDirty = true;
		return true;
	}

	setSequencedGearshiftPowered(dimensionId, location, powered) {
		if (typeof powered !== "boolean")
			throw new TypeError("Sequenced gearshift power state must be boolean");
		const node = this.#nodes.get(dimensionId, location);
		if (!node || node.configuration.kind !== "sequenced_gearshift")
			return false;
		const previous = node.reversed;
		node.reversed = powered;
		if (powered && !previous) {
			node.sequence.active = true;
			node.sequence.step = 0;
			node.sequence.ticksRemaining = node.sequence.program[0].duration;
		}
		if (!powered && previous) {
			node.sequence.active = false;
			node.sequence.step = 0;
			node.sequence.ticksRemaining = 0;
		}
		if (previous === powered)
			return false;
		this.#markDirty(dimensionId);
		this.#persistenceDirty = true;
		return true;
	}

	setChainGearshiftSignal(dimensionId, location, signal) {
		if (!Number.isInteger(signal) || signal < 0 || signal > 15)
			throw new RangeError("Chain gearshift signal must be an integer between 0 and 15");
		const node = this.#nodes.get(dimensionId, location);
		if (!node || node.configuration.kind !== "chain_gearshift" || node.chainSignal === signal)
			return false;
		node.chainSignal = signal;
		this.#refreshConnectionsAt(dimensionId, location);
		this.#markDirty(dimensionId);
		this.#persistenceDirty = true;
		return true;
	}

	isBeltPulley(dimensionId, location) {
		return isBeltPulley(this.#nodes.get(dimensionId, location));
	}

	connectBelt(dimensionId, leftLocation, rightLocation) {
		const leftId = worldLocationKey(dimensionId, leftLocation);
		const rightId = worldLocationKey(dimensionId, rightLocation);
		const left = this.#nodes.get(dimensionId, leftLocation);
		const right = this.#nodes.get(dimensionId, rightLocation);
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
		this.#markDirty(dimensionId);
		this.#persistenceDirty = true;
		return { ok: true };
	}

	captureInternalBeltLinks(dimensionId, locations, anchor) {
		const included = new Set(locations.map(location => worldLocationKey(dimensionId, location)));
		return [...this.#beltLinks.values()]
			.filter(link => link.left.dimensionId === dimensionId && included.has(link.leftId) && included.has(link.rightId))
			.map(link => ({
				left: {
					x: link.left.location.x - anchor.x,
					y: link.left.location.y - anchor.y,
					z: link.left.location.z - anchor.z
				},
				right: {
					x: link.right.location.x - anchor.x,
					y: link.right.location.y - anchor.y,
					z: link.right.location.z - anchor.z
				}
			}));
	}

	restoreInternalBeltLinks(dimensionId, origin, records) {
		if (!Array.isArray(records))
			return 0;
		let restored = 0;
		for (const record of records) {
			const materialize = relative => ({
				x: origin.x + relative.x,
				y: origin.y + relative.y,
				z: origin.z + relative.z
			});
			if (![record?.left, record?.right].every(relative => Number.isInteger(relative?.x) && Number.isInteger(relative?.y) && Number.isInteger(relative?.z)))
				continue;
			if (this.connectBelt(dimensionId, materialize(record.left), materialize(record.right)).ok)
				restored++;
		}
		return restored;
	}

	activateHandCrank(block, duration = 20) {
		if (!Number.isInteger(duration) || duration <= 0)
			throw new RangeError("Hand-crank duration must be a positive integer tick count");
		const node = this.#nodes.get(block.dimension.id, block.location);
		if (!node || node.typeId !== "createbedrock:hand_crank")
			return false;

		node.turnTicksRemaining = Math.max(node.turnTicksRemaining, duration);
		this.#markDirty(block.dimension.id);
		this.#persistenceDirty = true;
		return true;
	}

	consumePersistenceDirty() {
		const dirty = this.#persistenceDirty;
		this.#persistenceDirty = false;
		return dirty;
	}

	tick() {
		for (const dimensionId of this.advanceTick())
			this.resolveDirtyDimension(dimensionId);
	}

	advanceTick() {
		let advancedSource = false;
		for (const node of this.#nodes.values()) {
			if (node.configuration.kind === "sequenced_gearshift" && node.sequence?.active) {
				node.sequence.ticksRemaining--;
				advancedSource = true;
				if (node.sequence.ticksRemaining <= 0) {
					node.sequence.step = (node.sequence.step + 1) % node.sequence.program.length;
					node.sequence.ticksRemaining = node.sequence.program[node.sequence.step].duration;
					this.#markDirty(node.dimensionId);
				}
			}
			if (node.turnTicksRemaining <= 0)
				continue;

			node.turnTicksRemaining--;
			advancedSource = true;
			if (node.turnTicksRemaining === 0)
				this.#markDirty(node.dimensionId);
		}
		if (advancedSource)
			this.#persistenceDirty = true;

		return [...this.#dirtyDimensions];
	}

	resolveDirtyDimension(dimensionId) {
		if (typeof dimensionId !== "string" || !this.#dirtyDimensions.has(dimensionId))
			return false;
		this.#resolvedByDimension.set(dimensionId, this.#resolve(dimensionId));
		this.#dirtyDimensions.delete(dimensionId);
		return true;
	}

	get latestResolved() {
		return [...this.#resolvedByDimension.values()].flat();
	}

	speedAt(dimensionId, location) {
		const id = worldLocationKey(dimensionId, location);
		for (const network of this.#resolvedByDimension.get(dimensionId) ?? []) {
			const node = network.nodeStates.find(state => state.id === id);
			if (node)
				return node.speed;
		}
		return 0;
	}

	#resolve(dimensionId) {
		const nodes = this.#nodes.entriesInDimension(dimensionId).map(entry => entry.value);
		const nodesById = new Map(nodes.map(node => [node.id, node]));
		const nodeIds = new Set(nodes.map(node => node.id));
		const buildNetwork = (controllerSources = new Map()) => {
			const network = new KineticNetwork();
			const portParentIds = new Map();
			const connectedPairs = new Set();
			const connect = (leftId, rightId, ratio) => {
				if (!leftId || !rightId)
					return;
				const id = linkKey(leftId, rightId);
				if (connectedPairs.has(id))
					return;
				connectedPairs.add(id);
				network.connect(leftId, rightId, ratio);
			};

			for (const node of nodes) {
				if (isSplitGearshift(node.configuration)) {
					for (const side of ["negative", "positive"]) {
						const portId = `${node.id}:gearshift:${side}`;
						network.addNode({ id: portId });
						portParentIds.set(portId, node.id);
					}
					continue;
				}
				if (isSpeedController(node.configuration)) {
					for (const side of ["input", "output"]) {
						const portId = speedControllerPortId(node, side);
						const source = controllerSources.get(portId);
						network.addNode({
							id: portId,
							sourceSpeed: source?.speed ?? 0,
							stressCapacity: source?.capacity ?? 0
						});
						portParentIds.set(portId, node.id);
					}
					continue;
				}
				const isTurning = node.turnTicksRemaining > 0;
				const sourceSpeed = isGeneratedSource(node.configuration)
					? node.generatedSpeed
					: isTurning ? node.configuration.turnSpeed ?? 0 : 0;
				const stressCapacity = isGeneratedSource(node.configuration)
					? Math.abs(sourceSpeed) > 0 ? node.configuration.kind === "external_source"
						? node.sourceCapacity
						: node.configuration.stressCapacity ?? 0 : 0
					: isTurning ? node.configuration.stressCapacity ?? 0 : 0;
				network.addNode({
					id: node.id,
					sourceSpeed,
					stressCapacity,
					stressImpact: node.configuration.stressImpact ?? 0
				});
			}

			for (const node of nodes) {
				if (!isSplitGearshift(node.configuration))
					continue;
				const ratio = node.configuration.kind === "sequenced_gearshift"
					? node.sequence?.active ? node.sequence.program[node.sequence.step].multiplier : 0
					: node.reversed ? -1 : 1;
				if (ratio !== 0)
					network.connect(
						`${node.id}:gearshift:negative`,
						`${node.id}:gearshift:positive`,
						ratio
					);
			}

			const endpointFor = (nodeId, adjacentId) => {
				const node = nodesById.get(nodeId);
				const adjacent = nodesById.get(adjacentId);
				if (!node || !adjacent)
					return undefined;
				if (isSpeedController(node.configuration))
					return speedControllerPortFor(node, adjacent);
				if (!isSplitGearshift(node.configuration))
					return nodeId;
				const side = adjacent.location[node.axis] > node.location[node.axis] ? "positive" : "negative";
				return `${node.id}:gearshift:${side}`;
			};

			for (const connection of this.#connections.values())
				if (nodeIds.has(connection.leftId) && nodeIds.has(connection.rightId))
					connect(
						endpointFor(connection.leftId, connection.rightId),
						endpointFor(connection.rightId, connection.leftId),
						connection.ratio
					);

			for (const link of this.#beltLinks.values()) {
				if (link.left.dimensionId === dimensionId
					&& this.#nodes.has(link.left.dimensionId, link.left.location)
					&& this.#nodes.has(link.right.dimensionId, link.right.location))
					connect(link.leftId, link.rightId, 1);
			}
			return { network, portParentIds };
		};

		const base = buildNetwork();
		const baseResults = base.network.resolve();
		const resultForPort = new Map();
		for (const result of baseResults)
			for (const state of result.nodeStates)
				resultForPort.set(state.id, result);

		const canSupplyController = (result, portId) => {
			const port = result?.nodeStates.find(state => state.id === portId);
			return Boolean(result && port && Math.abs(port.requestedSpeed) > 0.000001
				&& result.stressCapacity > 0 && !result.hasConflict && !result.overloaded);
		};
		const controllerSources = new Map();
		for (const node of nodes) {
			if (!isSpeedController(node.configuration) || node.targetSpeed === 0)
				continue;
			const inputId = speedControllerPortId(node, "input");
			const outputId = speedControllerPortId(node, "output");
			const inputResult = resultForPort.get(inputId);
			const outputResult = resultForPort.get(outputId);
			const inputPowered = canSupplyController(inputResult, inputId);
			const outputPowered = canSupplyController(outputResult, outputId);
			// Two independently powered sides are intentionally not bridged. The
			// final graph will fail closed on a conflicting target instead of adding
			// an unbounded source or silently choosing a direction.
			if (inputPowered === outputPowered)
				continue;
			const sourceResult = inputPowered ? inputResult : outputResult;
			const targetPortId = inputPowered ? outputId : inputId;
			const capacity = Math.max(0, sourceResult.stressCapacity - sourceResult.stressImpact);
			if (capacity > 0)
				controllerSources.set(targetPortId, { capacity, speed: node.targetSpeed });
		}

		const resolved = buildNetwork(controllerSources);
		return resolved.network.resolve().map(result => {
			const nodeStates = new Map();
			for (const state of result.nodeStates) {
				const parentId = resolved.portParentIds.get(state.id) ?? state.id;
				const isPositiveGearshiftPort = state.id.endsWith(":gearshift:positive");
				const isControllerInputPort = state.id.endsWith(":speed_controller:input");
				if (!nodeStates.has(parentId) || isPositiveGearshiftPort || isControllerInputPort)
					nodeStates.set(parentId, { ...state, id: parentId });
			}
			const physicalNodeStates = [...nodeStates.values()].sort((left, right) => left.id.localeCompare(right.id));
			return {
				...result,
				nodeIds: physicalNodeStates.map(state => state.id),
				nodeStates: physicalNodeStates
			};
		});
	}

	diagnostics() {
		return {
			beltLinks: this.#beltLinks.size,
			connections: this.#connections.size,
			dirtyDimensions: this.#dirtyDimensions.size,
			nodes: this.#nodes.size,
			nodesByDimension: this.#nodes.countsByDimension(),
			resolvedNetworks: this.latestResolved.length
		};
	}

	#removeConnectionsFor(nodeId) {
		for (const [id, connection] of this.#connections)
			if (connection.leftId === nodeId || connection.rightId === nodeId)
				this.#connections.delete(id);
	}

	#refreshConnectionsAt(dimensionId, location) {
		const node = this.#nodes.get(dimensionId, location);
		if (!node)
			return;
		this.#removeConnectionsFor(node.id);
		for (const [x, y, z] of NEIGHBOR_OFFSETS) {
			const adjacent = this.#nodes.get(dimensionId, {
				x: location.x + x,
				y: location.y + y,
				z: location.z + z
			});
			if (!adjacent)
				continue;
			const left = node.id < adjacent.id ? node : adjacent;
			const right = left === node ? adjacent : node;
			const ratio = connectionRatio(
				left,
				right,
				right.location.x - left.location.x,
				right.location.y - left.location.y,
				right.location.z - left.location.z
			);
			if (ratio !== undefined)
				this.#connections.set(linkKey(left.id, right.id), { leftId: left.id, ratio, rightId: right.id });
		}
	}

	#rebuildConnections() {
		this.#connections.clear();
		for (const node of this.#nodes.values())
			this.#refreshConnectionsAt(node.dimensionId, node.location);
	}

	#markDirty(dimensionId) {
		this.#dirtyDimensions.add(dimensionId);
	}
}
