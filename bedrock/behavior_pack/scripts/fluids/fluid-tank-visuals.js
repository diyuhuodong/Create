export function fluidFillLevel({ capacity, contents }, levels = 4) {
	if (!Number.isFinite(capacity) || capacity <= 0 || !Number.isInteger(levels) || levels < 1)
		throw new TypeError("Fluid visual levels require a positive capacity and level count");
	if (!contents || !Number.isFinite(contents.amount) || contents.amount <= 0)
		return 0;
	return Math.min(levels, Math.max(1, Math.ceil(contents.amount / capacity * levels)));
}

export function fluidVisualKind(contents) {
	if (contents?.typeId === "minecraft:water")
		return "water";
	if (contents?.typeId === "minecraft:lava")
		return "lava";
	if (contents?.typeId === "createbedrock:honey")
		return "honey";
	if (contents?.typeId === "createbedrock:chocolate")
		return "chocolate";
	if (contents?.typeId === "createbedrock:tea")
		return "tea";
	if (contents?.typeId === "createbedrock:milk")
		return "milk";
	return "empty";
}

export function tankSegmentForNeighbors({ hasTankAbove, hasTankBelow }) {
	if (hasTankAbove && hasTankBelow)
		return "middle";
	if (hasTankAbove)
		return "bottom";
	if (hasTankBelow)
		return "top";
	return "single";
}
