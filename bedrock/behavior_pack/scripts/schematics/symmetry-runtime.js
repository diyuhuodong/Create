import { BlockPermutation, system, world } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";

import {
	createSymmetryState,
	parseSymmetryState,
	resolveSymmetryTargets,
	serializeSymmetryState,
	SYMMETRY_MODES
} from "./symmetry-state.js";

export const WAND_OF_SYMMETRY_ITEM = "createbedrock:wand_of_symmetry";
export const SYMMETRY_STATE_PROPERTY = "createbedrock:symmetry_state";

const handledUseOn = new Set();
let appliedCopies = 0;
let failedOperations = 0;
let registered = false;

function isAirlike(typeId) {
	return [undefined, "minecraft:air", "minecraft:cave_air", "minecraft:void_air", "minecraft:water", "minecraft:flowing_water", "minecraft:lava", "minecraft:flowing_lava"].includes(typeId);
}

function selectedSlot(player) {
	const container = player?.getComponent?.("minecraft:inventory")?.container;
	const index = player?.selectedSlotIndex;
	if (!container || !Number.isInteger(index) || index < 0 || index >= container.size)
		return undefined;
	const itemStack = container.getItem(index);
	if (itemStack?.typeId !== WAND_OF_SYMMETRY_ITEM)
		return undefined;
	return { itemStack, setItem(value) { container.setItem(index, value); } };
}

function stateFor(player) {
	const holder = selectedSlot(player);
	if (!holder)
		throw new Error("Hold the Wand of Symmetry in the selected slot");
	return { holder, state: parseSymmetryState(holder.itemStack.getDynamicProperty(SYMMETRY_STATE_PROPERTY)) };
}

function saveState(holder, state) {
	holder.itemStack.setDynamicProperty(SYMMETRY_STATE_PROPERTY, serializeSymmetryState(state));
	holder.setItem(holder.itemStack);
}

function applySymmetry(player, source) {
	const { state } = stateFor(player);
	if (!state.center)
		throw new Error("Sneak-use a block first to set the symmetry center");
	if (!source?.typeId?.startsWith("createbedrock:"))
		throw new Error("The Wand of Symmetry copies Create Bedrock blocks only");
	const targets = resolveSymmetryTargets({ center: state.center, mode: state.mode, source: source.location });
	const resolved = targets.map(location => ({ block: source.dimension.getBlock(location), location }));
	if (resolved.some(entry => !entry.block || !isAirlike(entry.block.typeId)))
		throw new Error("Symmetry placement requires every mirrored target to be empty");
	const states = source.permutation.getAllStates();
	for (const entry of resolved)
		entry.block.setPermutation(BlockPermutation.resolve(source.typeId, states));
	appliedCopies += resolved.length;
	player.sendMessage?.(`Symmetry Wand placed ${resolved.length} mirrored block${resolved.length === 1 ? "" : "s"}.`);
	return true;
}

function configure(player) {
	let holder;
	let state;
	try {
		({ holder, state } = stateFor(player));
	} catch (error) {
		player.sendMessage?.(`Could not configure Wand of Symmetry: ${error}`);
		return;
	}
	const selected = Math.max(0, SYMMETRY_MODES.indexOf(state.mode));
	new ModalFormData()
		.title("Wand of Symmetry")
		.dropdown("Mode", SYMMETRY_MODES, selected)
		.show(player)
		.then(response => {
			if (response.canceled)
				return;
			const mode = SYMMETRY_MODES[response.formValues?.[0]] ?? state.mode;
			saveState(holder, createSymmetryState({ center: state.center, mode }));
			player.sendMessage?.(`Symmetry mode set to ${mode}.`);
		})
		.catch(error => {
			failedOperations++;
			player.sendMessage?.(`Could not configure Wand of Symmetry: ${error}`);
		});
}

export function getSymmetryDiagnostics() {
	return { appliedCopies, failedOperations };
}

export function registerSymmetryWand() {
	if (registered)
		return false;
	registered = true;
	world.afterEvents.itemStartUseOn.subscribe(event => {
		if (event.itemStack?.typeId !== WAND_OF_SYMMETRY_ITEM)
			return;
		handledUseOn.add(event.source.id);
		system.run(() => handledUseOn.delete(event.source.id));
		try {
			if (event.source.isSneaking) {
				const { holder, state } = stateFor(event.source);
				saveState(holder, createSymmetryState({ center: event.block.location, mode: state.mode }));
				event.source.sendMessage?.("Symmetry center saved.");
			} else
				applySymmetry(event.source, event.block);
		} catch (error) {
			failedOperations++;
			event.source.sendMessage?.(`Symmetry operation rejected: ${error}`);
		}
	});
	world.afterEvents.itemUse.subscribe(event => {
		if (event.itemStack?.typeId === WAND_OF_SYMMETRY_ITEM && event.source.isSneaking && !handledUseOn.has(event.source.id))
			configure(event.source);
	});
	return true;
}
