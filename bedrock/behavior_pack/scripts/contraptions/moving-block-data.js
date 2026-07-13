const adapters = new Map();

export function registerMovingBlockDataAdapter(typeId, adapter) {
	if (!typeId || typeof adapter?.capture !== "function" || typeof adapter?.detach !== "function" || typeof adapter?.restore !== "function")
		throw new TypeError("Moving block data adapters require capture(), detach(), and restore()");
	adapters.set(typeId, adapter);
}

export function captureMovingBlockData(typeId, dimensionId, location) {
	return adapters.get(typeId)?.capture(dimensionId, location);
}

export function detachMovingBlockData(typeId, dimensionId, location) {
	return adapters.get(typeId)?.detach(dimensionId, location);
}

export function restoreMovingBlockData(typeId, dimensionId, location, data) {
	return adapters.get(typeId)?.restore(dimensionId, location, data);
}
