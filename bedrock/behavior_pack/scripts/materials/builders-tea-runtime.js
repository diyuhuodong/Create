import { world } from "@minecraft/server";

import { buildersTeaEffectPlan } from "./builders-tea.js";

let failedEffects = 0;
let servingsConsumed = 0;

export function applyBuildersTeaEffect(player, itemStack) {
	const plan = buildersTeaEffectPlan(itemStack);
	if (!plan || typeof player?.addEffect !== "function")
		return false;
	player.addEffect(plan.effect, plan.duration, plan.options);
	servingsConsumed++;
	return true;
}

export function getBuildersTeaDiagnostics() {
	return { failedEffects, servingsConsumed };
}

export function registerBuildersTea() {
	world.afterEvents.itemUse.subscribe(event => {
		try {
			applyBuildersTeaEffect(event.source, event.itemStack);
		} catch (error) {
			failedEffects++;
			console.warn(`[Create Bedrock] Could not apply Builder's Tea haste: ${error}`);
		}
	});
}
