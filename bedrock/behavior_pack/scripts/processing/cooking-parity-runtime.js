import { COOKING_PARITY_RECIPES } from "./generated/cooking-parity-recipes.js";
import { inspectNativeCookingBridge } from "./native-cooking-bridge.js";

let bridge;

export function bindNativeCookingBridge(nextBridge) {
	const capability = inspectNativeCookingBridge(nextBridge);
	bridge = capability.supported ? nextBridge : undefined;
	return capability;
}

export function getCookingParityDiagnostics() {
	const capability = inspectNativeCookingBridge(bridge);
	return {
		bridge: capability.state,
		missingBridgeOperations: capability.missing,
		recipes: COOKING_PARITY_RECIPES.length,
		state: capability.supported ? "bridge_bound" : "fail_closed_pending_platform_probe"
	};
}

export function registerCookingParity() {
	// Binding is deliberately deferred until Windows validates the native
	// container/progress/XP APIs. The generated catalog and machine remain
	// available for a bridge without modifying native cooking behavior today.
}
