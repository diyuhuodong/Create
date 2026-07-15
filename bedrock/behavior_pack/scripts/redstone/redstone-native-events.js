const handlers = new Set();

function assertPowerLevel(powerLevel) {
	if (!Number.isInteger(powerLevel) || powerLevel < 0 || powerLevel > 15)
		throw new RangeError("Native redstone events require an integer power level from 0 through 15");
	return powerLevel;
}

/**
 * Register a runtime recipient for a stable native Bedrock redstone event.
 * This module intentionally has no Script API imports, so the event boundary
 * can be exhaustively tested under Node before it is bound to the game.
 */
export function registerNativeRedstoneEventHandler(handler) {
	if (typeof handler !== "function")
		throw new TypeError("Native redstone event handlers must be functions");
	handlers.add(handler);
	return () => handlers.delete(handler);
}

export function dispatchNativeRedstoneUpdate({ block, powerLevel }) {
	if (!block || typeof block.typeId !== "string" || !block.dimension || typeof block.dimension.id !== "string" || !block.location)
		throw new TypeError("Native redstone events require a block with a dimension and location");
	const event = {
		block,
		powerLevel: assertPowerLevel(powerLevel)
	};
	let handled = false;
	for (const handler of handlers)
		handled = handler(event) === true || handled;
	return handled;
}

export function nativeRedstoneEventHandlerCountForTesting() {
	return handlers.size;
}
