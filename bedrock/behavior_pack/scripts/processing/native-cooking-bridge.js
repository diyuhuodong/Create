export const NATIVE_COOKING_BRIDGE_REQUIREMENTS = Object.freeze([
	"observeStation",
	"reserveInput",
	"readProgress",
	"restoreInput",
	"writeOutput",
	"writeProgress",
	"awardExperience"
]);

/**
 * The stable Script API has to expose every operation below before the managed
 * parity engine can safely bind to a vanilla furnace. Returning unsupported is
 * intentional: it prevents a fallback that would duplicate output or silently
 * lose Java cooking time/experience semantics.
 */
export function inspectNativeCookingBridge(bridge) {
	const missing = NATIVE_COOKING_BRIDGE_REQUIREMENTS.filter(name => typeof bridge?.[name] !== "function");
	return Object.freeze({
		missing,
		state: missing.length === 0 ? "supported" : "pending_platform_probe",
		supported: missing.length === 0
	});
}
