import { EquipmentSlot, ItemStack, system, world } from "@minecraft/server";

import {
	copperTransformFor,
	isSandpaper,
	nextDurability,
	polishedOutputFor
} from "./sandpaper.js";

const pendingPolishes = new Map();
const recentUseOn = new Map();
let failedUses = 0;
let polishedItems = 0;
let transformedCopper = 0;
let registered = false;

function selectedSlot(player) {
	const container = player?.getComponent?.("minecraft:inventory")?.container;
	const index = player?.selectedSlotIndex;
	if (!container || !Number.isInteger(index) || index < 0 || index >= container.size)
		return undefined;
	const itemStack = container.getItem(index);
	if (!isSandpaper(itemStack?.typeId))
		return undefined;
	return { itemStack, setItem(value) { container.setItem(index, value); } };
}

function offhandSlot(player) {
	const slot = player?.getComponent?.("minecraft:equippable")?.getEquipmentSlot?.(EquipmentSlot.Offhand);
	const itemStack = slot?.getItem?.();
	return slot && itemStack ? { itemStack, setItem(value) { slot.setItem(value); } } : undefined;
}

function consumeOne(holder) {
	if (!holder?.itemStack || holder.itemStack.amount < 1)
		return false;
	if (holder.itemStack.amount === 1) {
		holder.setItem(undefined);
		return true;
	}
	const remainder = holder.itemStack.clone();
	remainder.amount--;
	holder.setItem(remainder);
	return true;
}

function giveItem(player, typeId) {
	const inventory = player?.getComponent?.("minecraft:inventory")?.container;
	if (!inventory)
		return false;
	const remainder = inventory.addItem(new ItemStack(typeId, 1));
	if (remainder)
		player.dimension.spawnItem(remainder, player.location);
	return true;
}

function damageSandpaper(holder) {
	const replacement = holder?.itemStack?.clone?.();
	const durability = replacement?.getComponent?.("minecraft:durability");
	if (!replacement || !durability)
		return false;
	const next = nextDurability({ damage: durability.damage, maxDurability: durability.maxDurability });
	if (next.broken)
		holder.setItem(undefined);
	else {
		durability.damage = next.damage;
		holder.setItem(replacement);
	}
	return true;
}

function isCreative(player) {
	return player?.getGameMode?.() === "creative";
}

export function polishOffhandItem(player) {
	const sandpaper = selectedSlot(player);
	const target = offhandSlot(player);
	const output = polishedOutputFor(target?.itemStack?.typeId);
	if (!sandpaper || !target || !output)
		return false;
	if (!isCreative(player) && !consumeOne(target))
		return false;
	try {
		if (!giveItem(player, output))
			throw new Error("Player inventory is unavailable");
		if (!isCreative(player) && !damageSandpaper(sandpaper))
			throw new Error("Sandpaper durability component is unavailable");
	} catch (error) {
		if (!isCreative(player))
			giveItem(player, target.itemStack.typeId);
		throw error;
	}
	polishedItems++;
	return true;
}

export function sandBlockWithPaper(player, block) {
	const sandpaper = selectedSlot(player);
	const transformed = copperTransformFor(block?.typeId);
	if (!sandpaper || !transformed || typeof block?.setType !== "function")
		return false;
	block.setType(transformed);
	if (!isCreative(player) && !damageSandpaper(sandpaper))
		throw new Error("Sandpaper durability component is unavailable");
	try {
		block.dimension.playSound("block.copper.scrape", block.location, { volume: 1, pitch: 1 });
	} catch {
		// Sound availability must not affect the server-authoritative transform.
	}
	transformedCopper++;
	return true;
}

export function getSandpaperDiagnostics() {
	return { failedUses, polishedItems, transformedCopper };
}

export function registerSandpaper() {
	if (registered)
		return false;
	registered = true;
	world.afterEvents.itemUse.subscribe(event => {
		if (!isSandpaper(event.itemStack?.typeId))
			return;
		const player = event.source;
		if (pendingPolishes.has(player.id))
			return;
		pendingPolishes.set(player.id, player);
		system.run(() => {
			pendingPolishes.delete(player.id);
			if (recentUseOn.delete(player.id))
				return;
			try { polishOffhandItem(player); } catch { failedUses++; }
		});
	});
	world.afterEvents.itemUseOn.subscribe(event => {
		if (!isSandpaper(event.itemStack?.typeId))
			return;
		recentUseOn.set(event.source.id, true);
		try { sandBlockWithPaper(event.source, event.block); } catch { failedUses++; }
	});
	return true;
}
