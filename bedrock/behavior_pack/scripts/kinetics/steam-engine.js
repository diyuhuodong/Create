export const STEAM_ENGINE_CONSUMPTION_PER_TICK = 50;

/**
 * Converts a compatible fluid-tank inspection into a bounded powered-shaft
 * output. The first port deliberately accepts water so test worlds can use
 * the existing fluid-tank pipeline; tagged heated water provides the higher
 * boiler tier without introducing an untracked item state.
 */
export function steamEngineOutput(contents) {
	if (!contents || contents.typeId !== "minecraft:water" || contents.amount < STEAM_ENGINE_CONSUMPTION_PER_TICK)
		return { capacity: 0, consume: 0, speed: 0 };
	const heated = Array.isArray(contents.tags) && contents.tags.includes("heated");
	const tier = heated ? 2 : 1;
	return {
		capacity: 64 * tier,
		consume: STEAM_ENGINE_CONSUMPTION_PER_TICK,
		speed: 16 * tier
	};
}
