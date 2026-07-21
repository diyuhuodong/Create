import { PROJECTED_ITEM_TAGS } from "./generated/p7-2-item-tags.js";

const TAG_ITEMS = new Map([
	["c:cobblestones", new Set(["minecraft:cobblestone"])],
	["c:eggs", new Set(["minecraft:egg"])],
	["c:flours/wheat", new Set(["createbedrock:wheat_flour"])],
	["c:ingots/copper", new Set(["minecraft:copper_ingot"])],
	["c:ingots/iron", new Set(["minecraft:iron_ingot"])],
	["c:ingots/zinc", new Set(["createbedrock:zinc_ingot"])],
	["c:nuggets/iron", new Set(["minecraft:iron_nugget"])],
	["c:nuggets/zinc", new Set(["createbedrock:zinc_nugget"])],
	["create:pulpifiable", new Set(["minecraft:bamboo", "minecraft:sugar_cane"])],
	["minecraft:leaves", new Set([
		"minecraft:acacia_leaves", "minecraft:azalea_leaves", "minecraft:birch_leaves", "minecraft:cherry_leaves",
		"minecraft:dark_oak_leaves", "minecraft:flowering_azalea_leaves", "minecraft:jungle_leaves", "minecraft:mangrove_leaves",
		"minecraft:oak_leaves", "minecraft:pale_oak_leaves", "minecraft:spruce_leaves"
	])],
	...PROJECTED_ITEM_TAGS
]);

export function itemMatchesBasinRequirement(item, requirement) {
	if (!item || typeof item.typeId !== "string" || !requirement)
		return false;
	if (requirement.typeId)
		return item.typeId === requirement.typeId;
	return TAG_ITEMS.get(requirement.tag)?.has(item.typeId) ?? false;
}

export function knownBasinTagItems(tag) {
	return [...(TAG_ITEMS.get(tag) ?? [])].sort();
}
