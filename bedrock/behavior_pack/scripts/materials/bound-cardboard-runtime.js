import { ItemStack, world } from "@minecraft/server";

import { BOUND_CARDBOARD_BLOCK, boundCardboardDrops, hasSilkTouch } from "./bound-cardboard.js";

let playerBreaks = 0;
let failedDrops = 0;

export function applyBoundCardboardDrops(event, { createItemStack = (typeId, amount) => new ItemStack(typeId, amount) } = {}) {
	if (event?.brokenBlockPermutation?.type?.id !== BOUND_CARDBOARD_BLOCK)
		return [];
	const drops = boundCardboardDrops({ silkTouch: hasSilkTouch(event.itemStackBeforeBreak) });
	for (const typeId of drops)
		event.dimension.spawnItem(createItemStack(typeId, 1), event.block.location);
	playerBreaks++;
	return drops;
}

export function getBoundCardboardDiagnostics() {
	return { playerBreaks, failedDrops };
}

export function registerBoundCardboard() {
	world.afterEvents.playerBreakBlock.subscribe(event => {
		try {
			applyBoundCardboardDrops(event);
		} catch {
			failedDrops++;
		}
	});
}
