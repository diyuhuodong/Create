export const SAND_PAPER = "createbedrock:sand_paper";
export const RED_SAND_PAPER = "createbedrock:red_sand_paper";
export const POLISHED_ROSE_QUARTZ = "createbedrock:polished_rose_quartz";
export const SANDPAPER_DURABILITY = 8;

export const SANDPAPER_ITEMS = Object.freeze(new Set([SAND_PAPER, RED_SAND_PAPER]));
export const POLISHING_RECIPES = Object.freeze({
	"createbedrock:rose_quartz": POLISHED_ROSE_QUARTZ
});

export function isSandpaper(typeId) {
	return SANDPAPER_ITEMS.has(typeId);
}

export function polishedOutputFor(typeId) {
	return POLISHING_RECIPES[typeId];
}

/** Match Java's axe-scrape first, then wax-removal fallback for every vanilla copper family. */
export function copperTransformFor(typeId) {
	if (typeof typeId !== "string" || !typeId.startsWith("minecraft:"))
		return undefined;
	const name = typeId.slice("minecraft:".length);
	if (name.startsWith("waxed_"))
		return `minecraft:${name.slice("waxed_".length)}`;
	if (name.startsWith("oxidized_"))
		return `minecraft:weathered_${name.slice("oxidized_".length)}`;
	if (name.startsWith("weathered_"))
		return `minecraft:exposed_${name.slice("weathered_".length)}`;
	if (name.startsWith("exposed_"))
		return `minecraft:${name.slice("exposed_".length)}`;
	return undefined;
}

export function nextDurability({ damage = 0, maxDurability = SANDPAPER_DURABILITY } = {}) {
	if (!Number.isInteger(damage) || damage < 0 || !Number.isInteger(maxDurability) || maxDurability < 1)
		throw new RangeError("Sandpaper durability requires non-negative integer damage and positive maximum durability");
	const next = damage + 1;
	return { broken: next >= maxDurability, damage: next };
}
