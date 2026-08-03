export const BUILDERS_TEA = "createbedrock:builders_tea";
export const BUILDERS_TEA_HASTE_TICKS = 180 * 20;

export function buildersTeaEffectPlan(itemStack) {
	if (itemStack?.typeId !== BUILDERS_TEA)
		return undefined;
	return {
		effect: "haste",
		duration: BUILDERS_TEA_HASTE_TICKS,
		options: { amplifier: 0, showParticles: false }
	};
}
