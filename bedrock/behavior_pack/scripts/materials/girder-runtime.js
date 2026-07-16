import { world } from "@minecraft/server";

import { BRACKET_TYPES, bracketTypeForNeighbor, girderShapeForConnections, METAL_GIRDER } from "./girder.js";

const OFFSETS = Object.freeze({
	xNegative: { x: -1, y: 0, z: 0 },
	xPositive: { x: 1, y: 0, z: 0 },
	zNegative: { x: 0, y: 0, z: -1 },
	zPositive: { x: 0, y: 0, z: 1 }
});
const SHAPE_STATE = "createbedrock:girder_shape";
const BRACKET_STATE = "createbedrock:bracket_type";
let bracketUpdates = 0;
let failedUpdates = 0;
let girderUpdates = 0;
let registered = false;

function offset(location, delta) {
	return { x: location.x + delta.x, y: location.y + delta.y, z: location.z + delta.z };
}

function setState(block, name, value) {
	if (!block?.setPermutation || block.permutation?.getAllStates?.()[name] === value)
		return false;
	block.setPermutation(block.permutation.withState(name, value));
	return true;
}

function girderConnections(block) {
	return Object.fromEntries(Object.entries(OFFSETS).map(([key, delta]) => [
		key,
		block.dimension.getBlock(offset(block.location, delta))?.typeId === METAL_GIRDER
	]));
}

export function updateMetalGirder(block) {
	if (block?.typeId !== METAL_GIRDER)
		return false;
	const changed = setState(block, SHAPE_STATE, girderShapeForConnections(girderConnections(block)));
	if (changed)
		girderUpdates++;
	return changed;
}

export function updateBracket(block) {
	if (!BRACKET_TYPES[block?.typeId])
		return false;
	for (const delta of Object.values(OFFSETS)) {
		const type = bracketTypeForNeighbor(block.dimension.getBlock(offset(block.location, delta))?.typeId);
		if (!type)
			continue;
		const changed = setState(block, BRACKET_STATE, type);
		if (changed)
			bracketUpdates++;
		return changed;
	}
	return false;
}

function updateNearby(dimension, location) {
	for (const delta of [{ x: 0, y: 0, z: 0 }, ...Object.values(OFFSETS)]) {
		const block = dimension.getBlock(offset(location, delta));
		updateMetalGirder(block);
		updateBracket(block);
	}
}

export function getGirderDiagnostics() {
	return { bracketUpdates, failedUpdates, girderUpdates };
}

export function registerGirders() {
	if (registered)
		return false;
	registered = true;
	world.afterEvents.playerPlaceBlock.subscribe(event => {
		try { updateNearby(event.block.dimension, event.block.location); } catch { failedUpdates++; }
	});
	world.afterEvents.playerBreakBlock.subscribe(event => {
		try { updateNearby(event.block.dimension, event.block.location); } catch { failedUpdates++; }
	});
	return true;
}
