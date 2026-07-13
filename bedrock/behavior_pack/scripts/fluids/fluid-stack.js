function normalizeTags(tags) {
	if (tags === undefined)
		return [];
	if (!Array.isArray(tags) || tags.some(tag => typeof tag !== "string" || tag.length === 0))
		throw new TypeError("Fluid tags must be non-empty strings");
	return [...new Set(tags)].sort();
}

function stableStringify(value) {
	if (value === null || typeof value !== "object")
		return JSON.stringify(value);
	if (Array.isArray(value))
		return `[${value.map(stableStringify).join(",")}]`;
	return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

export function cloneFluidStack(fluid) {
	if (!fluid || typeof fluid.typeId !== "string" || fluid.typeId.length === 0)
		throw new TypeError("Fluid stacks require a type identifier");
	if (!Number.isSafeInteger(fluid.amount) || fluid.amount < 1)
		throw new RangeError("Fluid amounts must be positive safe integers");
	if (fluid.temperature !== undefined && !Number.isFinite(fluid.temperature))
		throw new TypeError("Fluid temperatures must be finite numbers");
	const tags = normalizeTags(fluid.tags);
	return {
		amount: fluid.amount,
		...(fluid.temperature === undefined ? {} : { temperature: fluid.temperature }),
		...(tags.length === 0 ? {} : { tags }),
		typeId: fluid.typeId
	};
}

export function fluidStackFingerprint(fluid) {
	const normalized = cloneFluidStack(fluid);
	return stableStringify({
		tags: normalized.tags ?? [],
		temperature: normalized.temperature ?? null,
		typeId: normalized.typeId
	});
}

export function fluidReservationFingerprint(reservation) {
	return stableStringify(reservation);
}
