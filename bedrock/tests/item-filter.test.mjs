import assert from "node:assert/strict";
import test from "node:test";

import { ItemFilter, selectItemFilter } from "../behavior_pack/scripts/logistics/item-filter.js";

test("ItemFilter supports allow, deny, and tag-backed item matching", () => {
	const resolver = tag => tag === "create:plates" ? ["createbedrock:iron_sheet"] : [];
	const plates = new ItemFilter({ priority: 2, tags: ["create:plates"] }, { resolveTag: resolver });
	const blacklist = new ItemFilter({ mode: "deny", typeIds: ["minecraft:rotten_flesh"] });
	assert.equal(plates.accepts({ count: 1, typeId: "createbedrock:iron_sheet" }), true);
	assert.equal(plates.accepts({ count: 1, typeId: "minecraft:iron_ingot" }), false);
	assert.equal(blacklist.accepts({ count: 1, typeId: "minecraft:iron_ingot" }), true);
	assert.equal(blacklist.accepts({ count: 1, typeId: "minecraft:rotten_flesh" }), false);
});

test("Item filter selection honors priority and redstone lock state", () => {
	const low = new ItemFilter({ priority: 1, typeIds: ["minecraft:iron_ingot"] });
	const high = new ItemFilter({ priority: 3, typeIds: ["minecraft:iron_ingot"] });
	const stack = { count: 1, typeId: "minecraft:iron_ingot" };
	assert.equal(selectItemFilter([low, high], stack), high);
	assert.equal(selectItemFilter([low, high], stack, { locked: true }), undefined);
});

test("An empty ItemFilter behaves as an unfiltered port", () => {
	const filter = new ItemFilter();
	assert.equal(filter.accepts({ count: 1, typeId: "minecraft:iron_ingot" }), true);
});
