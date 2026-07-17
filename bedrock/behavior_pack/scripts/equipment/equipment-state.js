export const BACKTANK_AIR_BASE = 900;
export const BACKTANK_AIR_PER_CAPACITY_LEVEL = 300;
export const BACKTANK_SCHEMA_VERSION = 1;
export const POTATO_CANNON_SCHEMA_VERSION = 1;

export const BACKTANK_ITEMS = new Set([
	"createbedrock:copper_backtank",
	"createbedrock:netherite_backtank"
]);

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function integer(value, label, { maximum = Number.MAX_SAFE_INTEGER, minimum = 0 } = {}) {
	if (!Number.isInteger(value) || value < minimum || value > maximum)
		throw new RangeError(`${label} must be an integer between ${minimum} and ${maximum}`);
	return value;
}

function validateBacktankItem(value, label) {
	if (!BACKTANK_ITEMS.has(value))
		throw new TypeError(`${label} must be a supported Backtank item`);
	return value;
}

export function backtankCapacity(capacityLevel = 0) {
	return BACKTANK_AIR_BASE + BACKTANK_AIR_PER_CAPACITY_LEVEL * integer(capacityLevel, "Backtank capacity level", { maximum: 3 });
}

export function createBacktankState({ air = 0, capacityLevel = 0, itemType = "createbedrock:copper_backtank", revision = 0 } = {}) {
	validateBacktankItem(itemType, "Backtank item type");
	const capacity = backtankCapacity(capacityLevel);
	return {
		air: integer(air, "Backtank air", { maximum: capacity }),
		capacityLevel: integer(capacityLevel, "Backtank capacity level", { maximum: 3 }),
		itemType,
		revision: integer(revision, "Backtank revision"),
		schemaVersion: BACKTANK_SCHEMA_VERSION
	};
}

export function readBacktankState(value) {
	if (!value || typeof value !== "object" || Array.isArray(value))
		return createBacktankState();
	if (value.schemaVersion !== BACKTANK_SCHEMA_VERSION)
		throw new TypeError(`Unsupported Backtank schema ${value.schemaVersion}`);
	return createBacktankState(value);
}

export function refillBacktank(state, { speed = 0, waterlogged = false } = {}) {
	const current = readBacktankState(state);
	if (waterlogged || !Number.isFinite(speed) || speed === 0 || current.air >= backtankCapacity(current.capacityLevel))
		return { changed: false, state: current, ticksUntilNextFill: 0 };
	const absoluteSpeed = Math.abs(speed);
	const increment = Math.max(1, Math.min(5, Math.floor((absoluteSpeed - 100) / 20)));
	const ticksUntilNextFill = Math.max(0, Math.min(20, Math.floor(128 - absoluteSpeed / 5) - 108));
	const air = Math.min(backtankCapacity(current.capacityLevel), current.air + increment);
	return {
		changed: air !== current.air,
		state: { ...current, air, revision: current.revision + 1 },
		ticksUntilNextFill
	};
}

export function consumeBacktankAir(state, amount = 1) {
	const current = readBacktankState(state);
	integer(amount, "Backtank air consumption", { minimum: 1, maximum: backtankCapacity(current.capacityLevel) });
	if (current.air < amount)
		return { consumed: false, state: current };
	return { consumed: true, state: { ...current, air: current.air - amount, revision: current.revision + 1 } };
}

export function createPotatoCannonState({ cooldownUntil = 0, revision = 0 } = {}) {
	return {
		cooldownUntil: integer(cooldownUntil, "Potato Cannon cooldown"),
		revision: integer(revision, "Potato Cannon revision"),
		schemaVersion: POTATO_CANNON_SCHEMA_VERSION
	};
}

export function readPotatoCannonState(value) {
	if (!value || typeof value !== "object" || Array.isArray(value))
		return createPotatoCannonState();
	if (value.schemaVersion !== POTATO_CANNON_SCHEMA_VERSION)
		throw new TypeError(`Unsupported Potato Cannon schema ${value.schemaVersion}`);
	return createPotatoCannonState(value);
}

export function armPotatoCannon(state, { cooldownTicks, now } = {}) {
	const current = readPotatoCannonState(state);
	integer(now, "Potato Cannon current tick");
	integer(cooldownTicks, "Potato Cannon cooldown", { minimum: 1, maximum: 1200 });
	if (current.cooldownUntil > now)
		return { fired: false, state: current };
	return { fired: true, state: { ...current, cooldownUntil: now + cooldownTicks, revision: current.revision + 1 } };
}

export function cloneEquipmentState(state) {
	return clone(state);
}
