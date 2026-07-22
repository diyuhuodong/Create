export const EQUIPMENT_UPGRADE_SCHEMA_VERSION = 1;
export const EQUIPMENT_UPGRADE_ITEMS = Object.freeze({
	"createbedrock:capacity_upgrade": "capacity",
	"createbedrock:potato_recovery_upgrade": "potatoRecovery"
});
export const EQUIPMENT_UPGRADE_LIMITS = Object.freeze({ capacity: 3, potatoRecovery: 3 });

const TARGETS = Object.freeze({
	capacity: new Set(["createbedrock:copper_backtank", "createbedrock:netherite_backtank"]),
	potatoRecovery: new Set(["createbedrock:potato_cannon"])
});

function integer(value, label, maximum = Number.MAX_SAFE_INTEGER) {
	if (!Number.isInteger(value) || value < 0 || value > maximum)
		throw new RangeError(`${label} must be an integer between 0 and ${maximum}`);
	return value;
}

export function normalizeEquipmentUpgrades(value = {}) {
	return {
		capacity: integer(value.capacity ?? 0, "Capacity level", EQUIPMENT_UPGRADE_LIMITS.capacity),
		potatoRecovery: integer(value.potatoRecovery ?? 0, "Potato Recovery level", EQUIPMENT_UPGRADE_LIMITS.potatoRecovery)
	};
}

export function upgradeKindForItem(typeId) {
	return EQUIPMENT_UPGRADE_ITEMS[typeId];
}

export function applyEquipmentUpgrade(state, { expectedRevision, kind, receiptId, targetTypeId } = {}) {
	if (!Object.hasOwn(EQUIPMENT_UPGRADE_LIMITS, kind))
		throw new TypeError("Unknown equipment upgrade");
	if (!TARGETS[kind].has(targetTypeId))
		return { applied: false, reason: "incompatible", state };
	if (!Number.isInteger(expectedRevision) || expectedRevision !== state?.revision)
		return { applied: false, reason: "revision_conflict", state };
	if (typeof receiptId !== "string" || receiptId.length === 0)
		throw new TypeError("Upgrade receipt id must be a non-empty string");
	const upgrades = normalizeEquipmentUpgrades(state.upgrades ?? { capacity: state.capacityLevel });
	if (upgrades[kind] >= EQUIPMENT_UPGRADE_LIMITS[kind])
		return { applied: false, reason: "maximum_level", state };
	const next = {
		...state,
		lastUpgradeReceipt: receiptId,
		revision: state.revision + 1,
		upgrades: { ...upgrades, [kind]: upgrades[kind] + 1 }
	};
	if (kind === "capacity")
		next.capacityLevel = next.upgrades.capacity;
	return { applied: true, reason: "applied", state: next };
}

export function potatoRecoveryChance(level) {
	const normalized = integer(level, "Potato Recovery level", EQUIPMENT_UPGRADE_LIMITS.potatoRecovery);
	return normalized === 0 ? 0 : .125 + normalized * .125;
}

export function decidePotatoRecovery(level, roll) {
	if (!Number.isFinite(roll) || roll < 0 || roll >= 1)
		throw new RangeError("Recovery roll must be in [0, 1)");
	return roll < potatoRecoveryChance(level);
}
