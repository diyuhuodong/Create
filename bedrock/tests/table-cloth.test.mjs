import assert from "node:assert/strict";
import test from "node:test";

import {
	addShoppingListPurchase,
	addTableClothDisplayItem,
	createTableClothState,
	removeTableClothDisplayItem,
	shoppingListTotals,
	tableClothStockLevel
} from "../behavior_pack/scripts/materials/table-cloth.js";

const shop = {
	networkId: "factory",
	payment: { count: 3, itemType: "minecraft:emerald" },
	targetAddress: "market",
	wares: [{ count: 2, itemType: "minecraft:iron_ingot" }, { count: 1, itemType: "minecraft:gold_ingot" }]
};

test("Table Cloth keeps manual display items separate from configured shops", () => {
	const initial = createTableClothState();
	const added = addTableClothDisplayItem(initial, "minecraft:apple");
	assert.equal(added.changed, true);
	assert.deepEqual(added.state.displayItems, ["minecraft:apple"]);
	assert.equal(removeTableClothDisplayItem(added.state).itemType, "minecraft:apple");
	assert.equal(addTableClothDisplayItem(createTableClothState({ owner: "Seller", shop }), "minecraft:apple").changed, false);
});

test("Shopping Lists enforce one owner/network and price every purchased shop", () => {
	const state = createTableClothState({ owner: "Seller", shop });
	const first = addShoppingListPurchase(undefined, { clothId: "cloth:one", owner: state.owner, shop: state.shop, stockLevel: 4 });
	assert.equal(first.changed, true);
	const second = addShoppingListPurchase(first.state, { clothId: "cloth:one", owner: state.owner, shop: state.shop, stockLevel: 4 });
	assert.equal(second.changed, true);
	assert.equal(tableClothStockLevel(state, { alreadyPurchased: 2, availableByItem: { "minecraft:gold_ingot": 3, "minecraft:iron_ingot": 8 } }), 1);
	const totals = shoppingListTotals(second.state, clothId => clothId === "cloth:one" ? state : undefined);
	assert.equal(totals.ok, true);
	assert.deepEqual(totals.payments, [{ itemType: "minecraft:emerald", count: 6 }]);
	assert.deepEqual(totals.wares, [{ itemType: "minecraft:gold_ingot", count: 2 }, { itemType: "minecraft:iron_ingot", count: 4 }]);
	assert.equal(addShoppingListPurchase(second.state, { clothId: "cloth:two", owner: "Other", shop: state.shop, stockLevel: 1 }).reason, "different_shop_network");
});
