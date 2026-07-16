import { BlockPermutation, world } from "@minecraft/server";

import { casingForApplication } from "./casing-application.js";

let applications = 0;
let failedApplications = 0;
let registered = false;

function selectedStack(player, typeId) {
	const container = player?.getComponent?.("minecraft:inventory")?.container;
	const slot = player?.selectedSlotIndex;
	if (!container || !Number.isInteger(slot) || slot < 0 || slot >= container.size)
		return undefined;
	const stack = container.getItem(slot);
	if (stack?.typeId !== typeId || stack.amount < 1)
		return undefined;
	return {
		consume() {
			if (player.getGameMode?.() === "creative")
				return () => {};
			const restored = stack.clone();
			if (stack.amount === 1)
				container.setItem(slot, undefined);
			else {
				const remainder = stack.clone();
				remainder.amount--;
				container.setItem(slot, remainder);
			}
			return () => container.setItem(slot, restored);
		}
	};
}

export function applyCasing(player, block, itemTypeId) {
	const casing = casingForApplication(itemTypeId, block?.typeId);
	const selected = casing ? selectedStack(player, itemTypeId) : undefined;
	if (!casing || !selected)
		return false;
	const restoreItem = selected.consume();
	try {
		block.setPermutation(BlockPermutation.resolve(casing));
		applications++;
		return true;
	} catch (error) {
		restoreItem();
		failedApplications++;
		console.warn(`[Create Bedrock] Could not apply casing: ${error}`);
		return false;
	}
}

export function getCasingApplicationDiagnostics() { return { applications, failedApplications }; }

export function registerCasingApplications() {
	if (registered)
		return false;
	registered = true;
	world.afterEvents.itemUseOn.subscribe(event => {
		try {
			applyCasing(event.source, event.block, event.itemStack?.typeId);
		} catch (error) {
			failedApplications++;
			console.warn(`[Create Bedrock] Casing application failed: ${error}`);
		}
	});
	return true;
}
