import { world } from "@minecraft/server";

import { TREE_FERTILIZER_ITEM, treeFeatureFor } from "./tree-fertilizer.js";

let failedUses = 0;
let grownTrees = 0;
let registered = false;

function isCreative(player) { return player?.getGameMode?.() === "creative"; }

function selectedFertilizerSlot(player) {
	const container = player?.getComponent?.("minecraft:inventory")?.container;
	const slot = player?.selectedSlotIndex;
	if (!container || !Number.isInteger(slot) || slot < 0 || slot >= container.size)
		return undefined;
	const itemStack = container.getItem(slot);
	if (itemStack?.typeId !== TREE_FERTILIZER_ITEM)
		return undefined;
	return { itemStack, setItem(item) { container.setItem(slot, item); } };
}

function consumeOne(player) {
	if (isCreative(player))
		return true;
	const holder = selectedFertilizerSlot(player);
	if (!holder?.itemStack || holder.itemStack.amount < 1)
		return false;
	if (holder.itemStack.amount === 1)
		holder.setItem(undefined);
	else {
		const remainder = holder.itemStack.clone();
		remainder.amount--;
		holder.setItem(remainder);
	}
	return true;
}

/** Place the corresponding vanilla sapling feature before spending fertilizer. */
export function fertilizeTreeSapling(player, block) {
	const feature = treeFeatureFor(block?.typeId);
	if (!feature || !block?.dimension?.placeFeature)
		return false;
	let placed = false;
	try {
		placed = block.dimension.placeFeature(feature, block.location, false);
	} catch (error) {
		failedUses++;
		console.warn(`[Create Bedrock] Tree Fertilizer feature ${feature} failed: ${error}`);
		return false;
	}
	if (!placed)
		return false;
	if (!consumeOne(player)) {
		failedUses++;
		return false;
	}
	grownTrees++;
	try { block.dimension.playSound("item.bone_meal.use", block.location, { volume: .8, pitch: .9 }); } catch {}
	return true;
}

export function getTreeFertilizerDiagnostics() { return { failedUses, grownTrees }; }

export function registerTreeFertilizer() {
	if (registered)
		return false;
	registered = true;
	world.afterEvents.itemStartUseOn.subscribe(event => {
		if (event.itemStack?.typeId !== TREE_FERTILIZER_ITEM)
			return;
		try {
			if (!fertilizeTreeSapling(event.source, event.block))
				event.source?.sendMessage?.("Tree Fertilizer needs a supported sapling and enough room for its tree.");
		} catch (error) {
			failedUses++;
			event.source?.sendMessage?.(`Could not apply Tree Fertilizer: ${error}`);
		}
	});
	return true;
}
