import { system, world } from "@minecraft/server";

import {
	ROSE_QUARTZ_LAMP_BLOCK,
	collectConnectedRoseQuartzLamps,
	roseQuartzLampInputTransition,
	roseQuartzLampOutputFaces,
	roseQuartzLampOutputMask,
	roseQuartzLampState,
	roseQuartzLampTickTransition,
	withRoseQuartzLampState
} from "./rose-quartz-lamp.js";

export const ROSE_QUARTZ_LAMP_COMPONENT = "createbedrock:rose_quartz_lamp_runtime";

let clusterResets = 0;
let failedUpdates = 0;
let inputTransitions = 0;
let registered = false;
let tickTransitions = 0;

const NEIGHBOR_OFFSETS = [
	{ x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 },
	{ x: 0, y: -1, z: 0 }, { x: 0, y: 1, z: 0 },
	{ x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 }
];

function isRoseQuartzLamp(block) {
	return block?.typeId === ROSE_QUARTZ_LAMP_BLOCK;
}

function currentOutputMask(permutation) {
	const mask = permutation?.getAllStates?.()["createbedrock:output_mask"];
	if (!Number.isInteger(mask) || mask < 0 || mask > 63)
		throw new RangeError("Rose Quartz Lamp output mask must be an integer from 0 through 63");
	return mask;
}

function outputMaskFor(block) {
	return roseQuartzLampOutputMask(roseQuartzLampOutputFaces(block.location, location => block.dimension.getBlock(location)));
}

function setRoseQuartzLampState(block, nextState) {
	if (!isRoseQuartzLamp(block) || typeof block.setPermutation !== "function")
		return false;
	const current = roseQuartzLampState(block.permutation);
	const desired = {
		activate: nextState.activate ?? current.activate,
		powered: nextState.powered ?? current.powered,
		powering: nextState.powering ?? current.powering
	};
	const outputMask = outputMaskFor(block);
	if (desired.activate === current.activate && desired.powered === current.powered
		&& desired.powering === current.powering && outputMask === currentOutputMask(block.permutation))
		return false;
	let permutation = withRoseQuartzLampState(block.permutation, desired);
	if (outputMask !== currentOutputMask(permutation))
		permutation = permutation.withState("createbedrock:output_mask", outputMask);
	block.setPermutation(permutation);
	return true;
}

function resetConnectedLamps(block) {
	const lamps = collectConnectedRoseQuartzLamps({
		anchor: block.location,
		readBlock: location => block.dimension.getBlock(location)
	});
	for (const lamp of lamps) {
		if (setRoseQuartzLampState(lamp.block, { powering: 0 }))
			clusterResets++;
	}
}

export function applyRoseQuartzLampInput(block, powerLevel) {
	if (!isRoseQuartzLamp(block))
		return false;
	const transition = roseQuartzLampInputTransition(roseQuartzLampState(block.permutation), powerLevel);
	if (!transition.changed)
		return setRoseQuartzLampState(block, transition.state);
	if (transition.rising)
		resetConnectedLamps(block);
	const changed = setRoseQuartzLampState(block, transition.state);
	if (changed)
		inputTransitions++;
	return changed;
}

export function tickRoseQuartzLamp(block) {
	if (!isRoseQuartzLamp(block))
		return false;
	const transition = roseQuartzLampTickTransition(roseQuartzLampState(block.permutation));
	const changed = setRoseQuartzLampState(block, transition.state);
	if (changed && transition.changed)
		tickTransitions++;
	return changed;
}

export function syncRoseQuartzLampInput(block) {
	if (!isRoseQuartzLamp(block))
		return false;
	if (typeof block.getRedstonePower !== "function")
		return setRoseQuartzLampState(block, roseQuartzLampState(block.permutation));
	return applyRoseQuartzLampInput(block, block.getRedstonePower());
}

/** Refresh both sides before sampling native power so lamp neighbors cannot feed a newly placed lamp. */
export function refreshRoseQuartzLampConnections(block) {
	if (!isRoseQuartzLamp(block))
		return false;
	let changed = setRoseQuartzLampState(block, roseQuartzLampState(block.permutation));
	for (const offset of NEIGHBOR_OFFSETS) {
		const neighbor = block.dimension.getBlock({
			x: block.location.x + offset.x,
			y: block.location.y + offset.y,
			z: block.location.z + offset.z
		});
		if (isRoseQuartzLamp(neighbor))
			changed = setRoseQuartzLampState(neighbor, roseQuartzLampState(neighbor.permutation)) || changed;
	}
	return changed;
}

export function getRoseQuartzLampDiagnostics() {
	return { clusterResets, failedUpdates, inputTransitions, tickTransitions };
}

export function registerRoseQuartzLamp() {
	if (registered)
		return false;
	registered = true;
	system.beforeEvents.startup.subscribe(event => {
		event.blockComponentRegistry.registerCustomComponent(ROSE_QUARTZ_LAMP_COMPONENT, {
			onRedstoneUpdate(redstoneEvent) {
				try {
					applyRoseQuartzLampInput(redstoneEvent.block, redstoneEvent.powerLevel);
				} catch {
					failedUpdates++;
				}
			},
			onTick(tickEvent) {
				try {
					tickRoseQuartzLamp(tickEvent.block);
				} catch {
					failedUpdates++;
				}
			}
		});
	});
	world.afterEvents.playerPlaceBlock.subscribe(event => {
		try {
			refreshRoseQuartzLampConnections(event.block);
			syncRoseQuartzLampInput(event.block);
		} catch {
			failedUpdates++;
		}
	});
	return true;
}
