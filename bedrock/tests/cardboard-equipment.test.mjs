import assert from "node:assert/strict";
import test from "node:test";

import { CARDBOARD_ARMOR, CARDBOARD_SWORD, cardboardSwordImpulse, hasFullCardboardArmor, isArthropod, isCardboardSword } from "../behavior_pack/scripts/materials/cardboard-equipment.js";
import { validateCardboardEquipment } from "../tools/content-material-cardboard-equipment-contract.mjs";

test("cardboard equipment preserves full-set stealth and harmless knockback semantics", () => {
	assert.equal(hasFullCardboardArmor({
		head: { typeId: CARDBOARD_ARMOR.head },
		chest: { typeId: CARDBOARD_ARMOR.chest },
		legs: { typeId: CARDBOARD_ARMOR.legs },
		feet: { typeId: CARDBOARD_ARMOR.feet }
	}), true);
	assert.equal(hasFullCardboardArmor({ head: { typeId: CARDBOARD_ARMOR.head } }), false);
	assert.equal(isCardboardSword({ typeId: CARDBOARD_SWORD }), true);
	assert.equal(isArthropod({ typeId: "minecraft:spider" }), true);
	assert.deepEqual(cardboardSwordImpulse({ x: 0, z: 0 }, { x: 3, z: 4 }), { x: 0.33, y: 0.15, z: 0.44000000000000006 });
});

test("cardboard equipment resources, recipes, attachables, and runtime are complete", async () => {
	const result = await validateCardboardEquipment();
	assert.equal(result.armorItems, 4);
	assert.equal(result.items, 5);
});
