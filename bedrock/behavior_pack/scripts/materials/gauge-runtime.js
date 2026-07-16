import { world } from "@minecraft/server";

import { registerMovingBlockDataContributor } from "../contraptions/moving-block-data.js";
import { enqueueUniqueKernelTask, registerKernelTaskGroup, registerTickHandler } from "../kernel/index.js";
import { GAUGE_BLOCKS, gaugeReading } from "./gauge.js";

const DIAL_LEVEL_STATE = "createbedrock:dial_level";
const GAUGE_COLOR_STATE = "createbedrock:gauge_color";
const GAUGE_AXIS_STATE = "createbedrock:axis";
const SIGNAL_STATE = "createbedrock:signal";
const GAUGE_TASK_GROUP = "gauges";
const GAUGE_TASK_BUDGET = 8;
const AXIS_BY_FACING = Object.freeze({ 0: "y", 1: "y", 2: "z", 3: "z", 4: "x", 5: "x" });

let changedReadings = 0;
let failedUpdates = 0;
let registered = false;
let scannedGauges = 0;

function kindFor(block) {
	return GAUGE_BLOCKS[block?.typeId];
}

function stateFor(block, name) {
	return block?.permutation?.getAllStates?.()[name];
}

function gaugeAxis(block) {
	const configured = stateFor(block, GAUGE_AXIS_STATE);
	if (["x", "y", "z"].includes(configured))
		return configured;
	return AXIS_BY_FACING[stateFor(block, "minecraft:facing_direction")] ?? "y";
}

function setGaugeStates(block, values) {
	if (!kindFor(block) || typeof block.setPermutation !== "function")
		return false;
	let permutation = block.permutation;
	let changed = false;
	for (const [name, value] of Object.entries(values)) {
		if (permutation.getAllStates?.()[name] === value)
			continue;
		permutation = permutation.withState(name, value);
		changed = true;
	}
	if (changed)
		block.setPermutation(permutation);
	return changed;
}

function updateGauge(block, kineticWorld) {
	const kind = kindFor(block);
	if (!kind)
		return false;
	const network = kineticWorld.networkAt(block.dimension.id, block.location);
	const reading = gaugeReading(kind, network);
	const changed = setGaugeStates(block, {
		[DIAL_LEVEL_STATE]: reading.displayLevel,
		[GAUGE_COLOR_STATE]: reading.color,
		[SIGNAL_STATE]: reading.signal
	});
	if (changed)
		changedReadings++;
	return changed;
}

function resolveBlock(dimensionId, location) {
	try {
		return world.getDimension(dimensionId).getBlock(location);
	} catch {
		return undefined;
	}
}

function captureGaugeMovingData(dimensionId, location) {
	const block = resolveBlock(dimensionId, location);
	if (!kindFor(block))
		return undefined;
	return {
		axis: gaugeAxis(block),
		color: stateFor(block, GAUGE_COLOR_STATE) ?? 0,
		dialLevel: stateFor(block, DIAL_LEVEL_STATE) ?? 0,
		signal: stateFor(block, SIGNAL_STATE) ?? 0
	};
}

function restoreGaugeMovingData(dimensionId, location, state) {
	if (!state || typeof state !== "object")
		return false;
	const block = resolveBlock(dimensionId, location);
	return setGaugeStates(block, {
		[DIAL_LEVEL_STATE]: Number.isInteger(state.dialLevel) && state.dialLevel >= 0 && state.dialLevel <= 15 ? state.dialLevel : 0,
		[GAUGE_COLOR_STATE]: Number.isInteger(state.color) && state.color >= 0 && state.color <= 3 ? state.color : 0,
		[GAUGE_AXIS_STATE]: ["x", "y", "z"].includes(state.axis) ? state.axis : "y",
		[SIGNAL_STATE]: Number.isInteger(state.signal) && state.signal >= 0 && state.signal <= 15 ? state.signal : 0
	});
}

function registerGaugePlacement(kineticWorld, block) {
	if (!kindFor(block))
		return false;
	const axis = gaugeAxis(block);
	const changed = setGaugeStates(block, { [GAUGE_AXIS_STATE]: axis });
	// Kinetics subscribes before this runtime. Re-track after normalizing the
	// placement axis so the gauge shares the same physical shaft axis.
	kineticWorld.trackPlacedBlock(block);
	return changed;
}

export function getGaugeDiagnostics() {
	return { changedReadings, failedUpdates, scannedGauges };
}

export function registerGauges(kineticWorld) {
	if (registered)
		return false;
	if (!kineticWorld || typeof kineticWorld.networkAt !== "function" || typeof kineticWorld.trackPlacedBlock !== "function")
		throw new TypeError("Gauge runtime requires the kinetic world network and placement APIs");
	registered = true;
	registerKernelTaskGroup(GAUGE_TASK_GROUP, GAUGE_TASK_BUDGET);
	world.afterEvents.playerPlaceBlock.subscribe(event => {
		try {
			registerGaugePlacement(kineticWorld, event.block);
		} catch (error) {
			failedUpdates++;
			console.warn(`[Create Bedrock] Could not initialize Gauge: ${error}`);
		}
	});
	registerTickHandler(() => {
		for (const node of kineticWorld.snapshot().nodes) {
			if (!GAUGE_BLOCKS[node.typeId])
				continue;
			const taskId = `gauge:${node.dimensionId}:${node.location.x}:${node.location.y}:${node.location.z}`;
			enqueueUniqueKernelTask(taskId, () => {
				try {
					const block = world.getDimension(node.dimensionId).getBlock(node.location);
					if (kindFor(block)) {
						scannedGauges++;
						updateGauge(block, kineticWorld);
					}
				} catch (error) {
					failedUpdates++;
					console.warn(`[Create Bedrock] Could not update Gauge: ${error}`);
				}
			}, GAUGE_TASK_GROUP);
		}
	});
	for (const typeId of Object.keys(GAUGE_BLOCKS)) {
		registerMovingBlockDataContributor(typeId, "gauge", {
			capture: captureGaugeMovingData,
			detach() {},
			restore: restoreGaugeMovingData,
			schemaVersion: 1,
			validate(state) {
				if (!state || typeof state !== "object" || !["x", "y", "z"].includes(state.axis)
					|| !Number.isInteger(state.color) || state.color < 0 || state.color > 3
					|| !Number.isInteger(state.dialLevel) || state.dialLevel < 0 || state.dialLevel > 15
					|| !Number.isInteger(state.signal) || state.signal < 0 || state.signal > 15)
					throw new TypeError("Moving Gauge data must preserve axis, color, dial level, and signal states");
			}
		});
	}
	return true;
}
