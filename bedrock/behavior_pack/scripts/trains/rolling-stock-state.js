export const BOGEY_SIZES = Object.freeze({ large: { carriageSpacing: 4, carriageWeight: 2 }, small: { carriageSpacing: 2, carriageWeight: 1 } });

export function normalizeBogeyRecord(value) {
	if (!value || typeof value.id !== "string" || value.id.length === 0 || !BOGEY_SIZES[value.size] || typeof value.dimensionId !== "string" || ![value.location?.x, value.location?.y, value.location?.z].every(Number.isInteger))
		throw new TypeError("Bogeys require a stable id, size, dimension, and integer location");
	return { dimensionId: value.dimensionId, id: value.id, location: { ...value.location }, size: value.size, style: typeof value.style === "string" && value.style.length > 0 ? value.style : "standard", trainId: typeof value.trainId === "string" ? value.trainId : undefined };
}

export function formationForBogeys(records) {
	const bogeys = records.map(normalizeBogeyRecord);
	if (bogeys.length === 0)
		throw new RangeError("A train formation requires at least one bogey");
	return {
		carriageCount: Math.max(1, Math.ceil(bogeys.reduce((total, bogey) => total + BOGEY_SIZES[bogey.size].carriageWeight, 0) / 2)),
		carriageSpacing: Math.max(...bogeys.map(bogey => BOGEY_SIZES[bogey.size].carriageSpacing)),
		bogeyIds: bogeys.map(bogey => bogey.id).sort()
	};
}
