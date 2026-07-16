import { world } from "@minecraft/server";

import { registerMovingBlockDataContributor } from "../contraptions/moving-block-data.js";
import { registerNativeRedstoneEventHandler } from "../redstone/redstone-native-events.js";
import {
	DOOR_HALF_STATE,
	DOOR_HINGE_STATE,
	DOOR_OPEN_STATE,
	DOOR_POWERED_STATE,
	SLIDING_DOOR_BLOCKS,
	doorLateralOffset,
	doorPairLocation,
	doorStatesForPower,
	isSlidingDoor,
	normalizeDoorState,
	toggledDoorState
} from "./sliding-door.js";

let failedUpdates = 0;
let manualToggles = 0;
let pairedToggles = 0;
let registered = false;
let redstoneToggles = 0;

function blockState(block, name, fallback = 0) {
	const state = block?.permutation?.getAllStates?.()[name];
	return Number.isInteger(state) ? state : fallback;
}

function stateOf(block) {
	return normalizeDoorState({
		half: blockState(block, DOOR_HALF_STATE),
		hinge: blockState(block, DOOR_HINGE_STATE),
		open: blockState(block, DOOR_OPEN_STATE),
		powered: blockState(block, DOOR_POWERED_STATE)
	});
}

function setStates(block, states) {
	if (!isSlidingDoor(block?.typeId) || typeof block.setPermutation !== "function")
		return false;
	let permutation = block.permutation;
	let changed = false;
	for (const [name, value] of Object.entries(states)) {
		const stateName = name === "half" ? DOOR_HALF_STATE : name === "hinge" ? DOOR_HINGE_STATE : name === "open" ? DOOR_OPEN_STATE : name === "powered" ? DOOR_POWERED_STATE : name;
		if (permutation.getAllStates?.()[stateName] === value)
			continue;
		permutation = permutation.withState(stateName, value);
		changed = true;
	}
	if (changed)
		block.setPermutation(permutation);
	return changed;
}

function pairedBlock(block) {
	if (!isSlidingDoor(block?.typeId))
		return undefined;
	return block.dimension.getBlock(doorPairLocation(block.location, stateOf(block).half));
}

function lowerBlock(block) {
	return stateOf(block).half === 0 ? block : pairedBlock(block);
}

function matchingDoubleDoor(lower) {
	if (!isSlidingDoor(lower?.typeId) || stateOf(lower).half !== 0)
		return undefined;
	const states = stateOf(lower);
	const facing = blockState(lower, "minecraft:facing_direction", 2);
	if (![2, 3, 4, 5].includes(facing))
		return undefined;
	const offset = doorLateralOffset(facing, states.hinge);
	const candidate = lower.dimension.getBlock({ x: lower.location.x + offset.x, y: lower.location.y, z: lower.location.z + offset.z });
	if (candidate?.typeId !== lower.typeId)
		return undefined;
	const other = stateOf(candidate);
	return other.half === 0 && other.hinge !== states.hinge && blockState(candidate, "minecraft:facing_direction", -1) === facing ? candidate : undefined;
}

function setPairStates(block, values) {
	const lower = lowerBlock(block);
	if (!isSlidingDoor(lower?.typeId))
		return false;
	const upper = pairedBlock(lower);
	let changed = setStates(lower, { ...stateOf(lower), ...values, half: 0 });
	if (upper?.typeId === lower.typeId)
		changed = setStates(upper, { ...stateOf(upper), ...values, half: 1 }) || changed;
	return changed;
}

function setDoorOpen(block, open, powered) {
	const lower = lowerBlock(block);
	if (!isSlidingDoor(lower?.typeId))
		return false;
	let changed = setPairStates(lower, { open, powered });
	const other = matchingDoubleDoor(lower);
	if (other)
		changed = setPairStates(other, { open, powered }) || changed;
	return changed;
}

function chooseHinge(lower) {
	const facing = blockState(lower, "minecraft:facing_direction", 2);
	if (![2, 3, 4, 5].includes(facing))
		return 0;
	for (const hinge of [0, 1]) {
		const offset = doorLateralOffset(facing, hinge);
		const neighbor = lower.dimension.getBlock({ x: lower.location.x + offset.x, y: lower.location.y, z: lower.location.z + offset.z });
		if (neighbor?.typeId === lower.typeId && stateOf(neighbor).half === 0 && blockState(neighbor, "minecraft:facing_direction", -1) === facing)
			return stateOf(neighbor).hinge === 0 ? 1 : 0;
	}
	return 0;
}

export function initializeSlidingDoor(block) {
	if (!isSlidingDoor(block?.typeId) || stateOf(block).half !== 0)
		return false;
	const above = block.dimension.getBlock({ x: block.location.x, y: block.location.y + 1, z: block.location.z });
	if (!above || (above.typeId !== "minecraft:air" && above.typeId !== block.typeId))
		return false;
	const states = { ...stateOf(block), half: 0, hinge: chooseHinge(block), "minecraft:facing_direction": blockState(block, "minecraft:facing_direction", 2) };
	setStates(block, states);
	if (above.typeId !== block.typeId)
		above.setType(block.typeId);
	return setStates(above, { ...states, half: 1 });
}

export function applySlidingDoorPower(block, powerLevel) {
	if (!isSlidingDoor(block?.typeId))
		return false;
	const next = doorStatesForPower(powerLevel);
	const changed = setDoorOpen(block, next.open, next.powered);
	if (changed)
		redstoneToggles++;
	return changed;
}

export function toggleSlidingDoor(block) {
	if (!isSlidingDoor(block?.typeId))
		return false;
	const next = toggledDoorState(stateOf(block));
	const lower = lowerBlock(block);
	const hasPair = Boolean(matchingDoubleDoor(lower));
	const changed = setDoorOpen(lower, next.open, stateOf(lower).powered);
	if (changed)
		manualToggles++;
	if (hasPair && changed)
		pairedToggles++;
	return changed;
}

function cleanUpOtherHalf(event) {
	const old = event.brokenBlockPermutation;
	if (!isSlidingDoor(old?.type?.id))
		return;
	const states = old.getAllStates?.() ?? {};
	const half = states[DOOR_HALF_STATE] ?? 0;
	const other = event.dimension.getBlock(doorPairLocation(event.block.location, half));
	if (other?.typeId === old.type.id)
		other.setType("minecraft:air");
}

function captureDoorData(dimensionId, location) {
	try {
		const block = world.getDimension(dimensionId).getBlock(location);
		return isSlidingDoor(block?.typeId) ? stateOf(block) : undefined;
	} catch {
		return undefined;
	}
}

function restoreDoorData(dimensionId, location, data) {
	try {
		return setStates(world.getDimension(dimensionId).getBlock(location), normalizeDoorState(data));
	} catch {
		return false;
	}
}

export function getSlidingDoorDiagnostics() {
	return { failedUpdates, manualToggles, pairedToggles, redstoneToggles };
}

export function registerSlidingDoors() {
	if (registered)
		return false;
	registered = true;
	registerNativeRedstoneEventHandler(({ block, powerLevel }) => applySlidingDoorPower(block, powerLevel));
	world.afterEvents.playerPlaceBlock.subscribe(event => {
		if (!isSlidingDoor(event.block?.typeId))
			return;
		try {
			initializeSlidingDoor(event.block);
			applySlidingDoorPower(event.block, event.block.getRedstonePower?.() ?? 0);
		} catch { failedUpdates++; }
	});
	world.afterEvents.playerInteractWithBlock.subscribe(event => {
		if (event.itemStack || !isSlidingDoor(event.block?.typeId))
			return;
		try { toggleSlidingDoor(event.block); } catch { failedUpdates++; }
	});
	world.afterEvents.playerBreakBlock.subscribe(event => {
		try { cleanUpOtherHalf(event); } catch { failedUpdates++; }
	});
	for (const typeId of SLIDING_DOOR_BLOCKS)
		registerMovingBlockDataContributor(typeId, "sliding_door", {
			capture: captureDoorData,
			detach() {},
			restore: restoreDoorData,
			schemaVersion: 1,
			validate: normalizeDoorState
		});
	return true;
}
