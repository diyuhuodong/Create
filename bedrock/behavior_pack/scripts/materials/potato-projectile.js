export const POTATO_PROJECTILE_ENTITY = "createbedrock:potato_projectile";

const DEFAULT_PROFILE = Object.freeze({ damage: 0, drag: .95, gravity: 1, knockback: 0, velocity: 1.15 });

/** Java projectile-type values expressed in the Bedrock item identifiers used by the future cannon. */
export const POTATO_PROJECTILE_PROFILES = Object.freeze({
	"minecraft:potato": { damage: 5, knockback: 1.5, plant: "minecraft:potatoes", velocity: 1.25 },
	"minecraft:baked_potato": { damage: 5, fireSeconds: 3, knockback: .5, velocity: 1.25 },
	"minecraft:carrot": { damage: 4, knockback: .3, plant: "minecraft:carrots", velocity: 1.45 },
	"minecraft:golden_carrot": { damage: 12, knockback: .5, velocity: 1.45 },
	"minecraft:sweet_berries": { damage: 3, knockback: .1, split: 3, velocity: 1.05 },
	"minecraft:glow_berries": { damage: 2, effect: { amplifier: 0, duration: 200, type: "glowing" }, knockback: .05, split: 2, velocity: 1.05 },
	"createbedrock:chocolate_glazed_berries": { damage: 4, knockback: .2, split: 3, velocity: 1.05 },
	"minecraft:poisonous_potato": { damage: 5, effect: { amplifier: 0, duration: 160, type: "poison" }, knockback: .05, velocity: 1.25 },
	"minecraft:chorus_fruit": { damage: 3, knockback: .05, teleportDiameter: 20, velocity: 1.2 },
	"minecraft:apple": { damage: 5, knockback: .5, velocity: 1.45 },
	"createbedrock:honeyed_apple": { damage: 6, effect: { amplifier: 1, duration: 160, type: "slowness" }, knockback: .1, velocity: 1.35 },
	"minecraft:golden_apple": { damage: 1, knockback: .05, velocity: 1.45 },
	"minecraft:enchanted_golden_apple": { damage: 1, knockback: .05, velocity: 1.45 },
	"minecraft:beetroot": { damage: 2, knockback: .1, velocity: 1.6 },
	"minecraft:melon_slice": { damage: 3, knockback: .1, velocity: 1.45 },
	"minecraft:glistering_melon_slice": { damage: 5, effect: { amplifier: 0, duration: 100, type: "glowing" }, knockback: .1, velocity: 1.45 },
	"minecraft:melon_block": { damage: 8, knockback: 2, place: "minecraft:melon_block", velocity: .95 },
	"minecraft:pumpkin": { damage: 6, knockback: 2, place: "minecraft:pumpkin", velocity: .95 },
	"minecraft:pumpkin_pie": { damage: 7, knockback: .05, sticky: true, velocity: 1.1 },
	"minecraft:cake": { damage: 8, knockback: .1, sticky: true, velocity: 1.1 },
	"createbedrock:blaze_cake": { damage: 15, fireSeconds: 12, knockback: .3, sticky: true, velocity: 1.1 },
	"minecraft:cod": { damage: 4, knockback: .6, sticky: true, velocity: 1.3 },
	"minecraft:cooked_cod": { damage: 4, knockback: .6, sticky: true, velocity: 1.3 },
	"minecraft:salmon": { damage: 4, knockback: .6, sticky: true, velocity: 1.3 },
	"minecraft:cooked_salmon": { damage: 4, knockback: .6, sticky: true, velocity: 1.3 },
	"minecraft:tropical_fish": { damage: 4, knockback: .6, sticky: true, velocity: 1.3 },
	"minecraft:pufferfish": { damage: 4, effect: { amplifier: 0, duration: 120, type: "poison" }, knockback: .4, sticky: true, velocity: 1.1 },
	"minecraft:suspicious_stew": { damage: 3, drop: "minecraft:bowl", knockback: .2, velocity: .8 }
});

function validItemType(value) {
	return typeof value === "string" && /^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(value);
}

export function potatoProjectileProfile(itemTypeId) {
	if (!validItemType(itemTypeId))
		throw new TypeError("Potato projectile items must use a qualified identifier");
	return { ...DEFAULT_PROFILE, ...(POTATO_PROJECTILE_PROFILES[itemTypeId] ?? {}), itemTypeId };
}

export function normalizeProjectileDirection(direction) {
	if (![direction?.x, direction?.y, direction?.z].every(Number.isFinite))
		throw new TypeError("Potato projectile direction must use finite coordinates");
	const magnitude = Math.hypot(direction.x, direction.y, direction.z);
	if (magnitude === 0)
		throw new RangeError("Potato projectile direction must not be zero");
	return { x: direction.x / magnitude, y: direction.y / magnitude, z: direction.z / magnitude };
}

export function launchVelocity(itemTypeId, direction) {
	const profile = potatoProjectileProfile(itemTypeId);
	const normalized = normalizeProjectileDirection(direction);
	return { x: normalized.x * profile.velocity, y: normalized.y * profile.velocity, z: normalized.z * profile.velocity };
}

export function nextProjectileMotion(velocity, profile) {
	if (![velocity?.x, velocity?.y, velocity?.z].every(Number.isFinite))
		throw new TypeError("Potato projectile velocity must use finite coordinates");
	const current = { ...DEFAULT_PROFILE, ...profile };
	return {
		x: velocity.x * current.drag,
		y: (velocity.y - .05 * current.gravity) * current.drag,
		z: velocity.z * current.drag
	};
}

export function potatoProjectileHitPlan(itemTypeId) {
	const profile = potatoProjectileProfile(itemTypeId);
	return {
		damage: profile.damage,
		...(profile.effect ? { effect: { ...profile.effect } } : {}),
		...(profile.fireSeconds ? { fireSeconds: profile.fireSeconds } : {}),
		knockback: profile.knockback,
		...(profile.sticky ? { sticky: true } : {}),
		...(profile.teleportDiameter ? { teleportDiameter: profile.teleportDiameter } : {})
	};
}
