export const REDSTONE_COMPATIBILITY_TARGET = Object.freeze({
	id: "realm-console-1.21.80",
	inputMode: "registered_block_polling",
	minimumEngineVersion: Object.freeze([1, 21, 80]),
	outputMode: "blocked"
});

export const COMPATIBILITY_REDSTONE_CONTROLS = Object.freeze([
	Object.freeze(["createbedrock:andesite_funnel", "funnel"]),
	Object.freeze(["createbedrock:adjustable_chain_gearshift", "chain_gearshift"]),
	Object.freeze(["createbedrock:clutch", "clutch"]),
	Object.freeze(["createbedrock:gearshift", "gearshift"]),
	Object.freeze(["createbedrock:sequenced_gearshift", "sequenced_gearshift"]),
	Object.freeze(["createbedrock:mechanical_pump", "pump"])
]);

export const FORBIDDEN_REDSTONE_COMPONENTS = Object.freeze([
	"minecraft:redstone_consumer",
	"minecraft:redstone_producer"
]);

export function hasCompatibilityEngineVersion(version) {
	return Array.isArray(version)
		&& version.length === REDSTONE_COMPATIBILITY_TARGET.minimumEngineVersion.length
		&& version.every((value, index) => value === REDSTONE_COMPATIBILITY_TARGET.minimumEngineVersion[index]);
}
