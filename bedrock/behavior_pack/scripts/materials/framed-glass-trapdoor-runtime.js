import { world } from "@minecraft/server";

import { registerNativeRedstoneEventHandler } from "../redstone/redstone-native-events.js";
import {
	FRAMED_GLASS_TRAPDOOR_BLOCK,
	toggledTrapdoorPermutation,
	trapdoorStatesForPower,
	withTrapdoorStates
} from "./framed-glass-trapdoor.js";

let manualToggles = 0;
let powerUpdates = 0;
let failedUpdates = 0;

function isFramedGlassTrapdoor(block) {
	return block?.typeId === FRAMED_GLASS_TRAPDOOR_BLOCK;
}

function setPermutation(block, permutation) {
	if (!isFramedGlassTrapdoor(block) || typeof block.setPermutation !== "function")
		return false;
	block.setPermutation(permutation);
	return true;
}

export function applyFramedGlassTrapdoorPower(block, powerLevel) {
	if (!isFramedGlassTrapdoor(block))
		return false;
	const states = trapdoorStatesForPower(powerLevel);
	const permutation = withTrapdoorStates(block.permutation, states);
	if (!setPermutation(block, permutation))
		return false;
	powerUpdates++;
	return true;
}

export function syncFramedGlassTrapdoorPower(block) {
	if (!isFramedGlassTrapdoor(block) || typeof block.getRedstonePower !== "function")
		return false;
	return applyFramedGlassTrapdoorPower(block, block.getRedstonePower());
}

export function toggleFramedGlassTrapdoor(block) {
	if (!isFramedGlassTrapdoor(block))
		return false;
	if (!setPermutation(block, toggledTrapdoorPermutation(block.permutation)))
		return false;
	manualToggles++;
	return true;
}

function handleNativeRedstoneUpdate({ block, powerLevel }) {
	if (!isFramedGlassTrapdoor(block))
		return false;
	applyFramedGlassTrapdoorPower(block, powerLevel);
	return true;
}

export function getFramedGlassTrapdoorDiagnostics() {
	return { failedUpdates, manualToggles, powerUpdates };
}

export function registerFramedGlassTrapdoor() {
	registerNativeRedstoneEventHandler(event => {
		try {
			return handleNativeRedstoneUpdate(event);
		} catch {
			failedUpdates++;
			return false;
		}
	});
	world.afterEvents.playerPlaceBlock.subscribe(event => {
		try {
			syncFramedGlassTrapdoorPower(event.block);
		} catch {
			failedUpdates++;
		}
	});
	world.afterEvents.playerInteractWithBlock.subscribe(event => {
		if (event.itemStack)
			return;
		try {
			toggleFramedGlassTrapdoor(event.block);
		} catch {
			failedUpdates++;
		}
	});
}
