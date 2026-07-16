import { EquipmentSlot, ItemStack, world } from "@minecraft/server";

import { EXPERIENCE_NUGGET, experienceNuggetUsePlan } from "./experience-nugget.js";

let redeemedNuggets = 0;
let redeemedExperience = 0;
let failedRedemptions = 0;

function inventorySlotFor(player) {
	const container = player?.getComponent?.("minecraft:inventory")?.container;
	const slot = player?.selectedSlotIndex;
	if (!container || !Number.isInteger(slot) || slot < 0 || slot >= container.size)
		return undefined;
	const itemStack = container.getItem(slot);
	if (itemStack?.typeId !== EXPERIENCE_NUGGET)
		return undefined;
	return {
		itemStack,
		setItem(value) {
			container.setItem(slot, value);
		}
	};
}

function offhandSlotFor(player) {
	const equippable = player?.getComponent?.("minecraft:equippable");
	if (!equippable?.getEquipmentSlot)
		return undefined;
	const slot = equippable.getEquipmentSlot(EquipmentSlot.Offhand);
	const itemStack = slot?.getItem?.();
	if (itemStack?.typeId !== EXPERIENCE_NUGGET)
		return undefined;
	return {
		itemStack,
		setItem(value) {
			slot.setItem(value);
		}
	};
}

function heldExperienceNuggetSlot(player) {
	return inventorySlotFor(player) ?? offhandSlotFor(player);
}

function replaceConsumedStack(holder, plan) {
	if (plan.remaining === 0) {
		holder.setItem(undefined);
		return;
	}
	holder.setItem(new ItemStack(EXPERIENCE_NUGGET, plan.remaining));
}

/**
 * Java emits several small experience orbs, but Bedrock's public API cannot
 * assign a per-orb XP value.  Credit the same total to the acting player,
 * then consume exactly the Java-selected stack quantity atomically enough to
 * compensate the grant if the inventory write unexpectedly fails.
 */
export function redeemExperienceNugget(player, { isSneaking = player?.isSneaking } = {}) {
	const holder = heldExperienceNuggetSlot(player);
	if (!holder || typeof player?.addExperience !== "function")
		return false;
	const plan = experienceNuggetUsePlan({ count: holder.itemStack.amount, isSneaking });
	player.addExperience(plan.experience);
	try {
		replaceConsumedStack(holder, plan);
	} catch (error) {
		try {
			player.addExperience(-plan.experience);
		} catch {
			// The original write error remains authoritative; diagnostics expose it.
		}
		throw error;
	}
	redeemedNuggets += plan.consumed;
	redeemedExperience += plan.experience;
	return plan;
}

export function getExperienceNuggetDiagnostics() {
	return { failedRedemptions, redeemedExperience, redeemedNuggets };
}

export function registerExperienceNugget() {
	world.afterEvents.itemUse.subscribe(event => {
		if (event.itemStack?.typeId !== EXPERIENCE_NUGGET)
			return;
		try {
			redeemExperienceNugget(event.source);
		} catch {
			failedRedemptions++;
		}
	});
}
