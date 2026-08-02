export const REDSTONE_COMPATIBILITY_TARGET = Object.freeze({
	id: "realm-console-1.26.0",
	inputMode: "native_consumer_events_with_fail_closed_polling_fallback",
	minimumEngineVersion: Object.freeze([1, 26, 0]),
	outputMode: "native_components_with_device_implementations_in_progress"
});

export const COMPATIBILITY_REDSTONE_CONTROLS = Object.freeze([
	Object.freeze(["createbedrock:andesite_funnel", "funnel"]),
	Object.freeze(["createbedrock:adjustable_chain_gearshift", "chain_gearshift"]),
	Object.freeze(["createbedrock:clutch", "clutch"]),
	Object.freeze(["createbedrock:gearshift", "gearshift"]),
	Object.freeze(["createbedrock:sequenced_gearshift", "sequenced_gearshift"]),
	Object.freeze(["createbedrock:mechanical_pump", "pump"])
]);

export const NATIVE_REDSTONE_COMPONENTS = Object.freeze([
	"minecraft:redstone_consumer",
	"minecraft:redstone_producer"
]);

export const NATIVE_REDSTONE_SCRIPT_API_VERSION = "2.8.0";

export const NATIVE_REDSTONE_INPUT_COMPONENT = "createbedrock:redstone_input";

export function hasCompatibilityEngineVersion(version) {
	return Array.isArray(version)
		&& version.length === REDSTONE_COMPATIBILITY_TARGET.minimumEngineVersion.length
		&& version.every((value, index) => value === REDSTONE_COMPATIBILITY_TARGET.minimumEngineVersion[index]);
}
