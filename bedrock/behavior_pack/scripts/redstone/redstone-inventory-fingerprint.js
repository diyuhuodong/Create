function normalizeFilterItem(value) {
	if (typeof value !== "string" || value.length === 0)
		return "minecraft:air";
	return value;
}

/**
 * Produces a stable, slot-sensitive inventory sample for Content Observers.
 * An air filter observes every stack; a concrete item filter deliberately
 * omits all other stacks so unrelated stock changes cannot pulse the device.
 */
export function fingerprintInventoryStacks(stacks, filterItem = "minecraft:air") {
	if (!Array.isArray(stacks))
		throw new TypeError("Content observer inventory samples must be arrays");
	const filter = normalizeFilterItem(filterItem);
	return stacks.map((stack, slot) => {
		if (!stack || (filter !== "minecraft:air" && stack.typeId !== filter))
			return `${slot}:`;
		if (typeof stack.typeId !== "string" || !Number.isInteger(stack.amount) || stack.amount < 1)
			throw new TypeError("Content observer inventory stacks require an item type and positive integer amount");
		return `${slot}:${stack.typeId}:${stack.amount}`;
	}).join("|");
}
