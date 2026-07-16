export const CARDBOARD_ARMOR = Object.freeze({
	head: "createbedrock:cardboard_helmet",
	chest: "createbedrock:cardboard_chestplate",
	legs: "createbedrock:cardboard_leggings",
	feet: "createbedrock:cardboard_boots"
});

export const CARDBOARD_SWORD = "createbedrock:cardboard_sword";

const ARTHROPODS = new Set([
	"minecraft:bee",
	"minecraft:cave_spider",
	"minecraft:endermite",
	"minecraft:silverfish",
	"minecraft:spider"
]);

export function hasFullCardboardArmor(equipment) {
	return Object.entries(CARDBOARD_ARMOR).every(([slot, identifier]) => equipment?.[slot]?.typeId === identifier);
}

export function isCardboardSword(itemStack) {
	return itemStack?.typeId === CARDBOARD_SWORD;
}

export function isArthropod(entity) {
	return ARTHROPODS.has(entity?.typeId);
}

export function cardboardSwordImpulse(attackerLocation, targetLocation, strength = 0.55) {
	if (!Number.isFinite(strength) || strength <= 0)
		throw new RangeError("Cardboard-sword knockback requires a positive finite strength");
	const x = targetLocation?.x - attackerLocation?.x;
	const z = targetLocation?.z - attackerLocation?.z;
	if (!Number.isFinite(x) || !Number.isFinite(z))
		throw new TypeError("Cardboard-sword knockback requires finite locations");
	const magnitude = Math.hypot(x, z) || 1;
	return { x: (x / magnitude) * strength, y: 0.15, z: (z / magnitude) * strength };
}
