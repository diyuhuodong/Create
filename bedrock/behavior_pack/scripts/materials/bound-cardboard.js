export const BOUND_CARDBOARD_BLOCK = "createbedrock:bound_cardboard_block";

export function hasSilkTouch(itemStack) {
	try {
		const enchantable = itemStack?.getComponent("minecraft:enchantable");
		if (!enchantable)
			return false;
		try {
			return enchantable.hasEnchantment("minecraft:silk_touch") || enchantable.hasEnchantment("silk_touch");
		} catch {
			return enchantable.hasEnchantment("silk_touch");
		}
	} catch {
		return false;
	}
}

export function boundCardboardDrops({ silkTouch = false } = {}) {
	return silkTouch
		? [BOUND_CARDBOARD_BLOCK]
		: ["minecraft:string", "createbedrock:cardboard_block"];
}
