export const SIGNAL_STATE = Object.freeze({ GREEN: "green", INVALID: "invalid", RED: "red", YELLOW: "yellow" });

export function signalStateFor({ adjacentReserved = false, edge, edgeAvailable }) {
	if (!edge || !edgeAvailable)
		return SIGNAL_STATE.INVALID;
	if (edge.reservedBy !== undefined)
		return SIGNAL_STATE.RED;
	return adjacentReserved ? SIGNAL_STATE.YELLOW : SIGNAL_STATE.GREEN;
}

export function observerMatchesTrain(filter, trainId) {
	if (typeof filter !== "string" || typeof trainId !== "string")
		throw new TypeError("Observer filters and train ids must be strings");
	return filter.length === 0 || trainId.includes(filter);
}

export function passingTrainForEdge({ edgeId, filter = "", trains }) {
	if (typeof edgeId !== "string" || edgeId.length === 0 || !Array.isArray(trains))
		throw new TypeError("Observer passage lookup requires an edge and train records");
	return [...trains]
		.filter(train => train?.edgeId === edgeId && typeof train.id === "string" && observerMatchesTrain(filter, train.id))
		.map(train => train.id)
		.sort()[0];
}

export function controllerRailTransition({ heldTrainIds = [], powered, trains }) {
	if (!Array.isArray(heldTrainIds) || !Array.isArray(trains))
		throw new TypeError("Controller rails require train arrays");
	const active = new Set(trains.filter(train => typeof train?.id === "string").map(train => train.id));
	const held = new Set(heldTrainIds.filter(id => typeof id === "string"));
	if (!powered)
		return { release: [...held].filter(id => active.has(id)).sort(), stop: [] };
	return { release: [], stop: [...active].filter(id => !held.has(id)).sort() };
}
