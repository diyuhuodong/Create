import assert from "node:assert/strict";
import test from "node:test";
import { createFilterExpression, filterExpressionMatches } from "../behavior_pack/scripts/logistics/filter-expression.js";

test("list, attribute, and package predicates compose deterministically", () => {
	const filter = createFilterExpression({ packages: ["Brass"], tags: ["forge:plates"], typeIds: ["createbedrock:brass_sheet"] });
	assert.equal(filterExpressionMatches(filter, { packageAddress: "Brass", stack: { typeId: "createbedrock:brass_sheet" }, tagsFor: () => ["createbedrock:brass_sheet"] }), true);
	assert.equal(filterExpressionMatches(filter, { packageAddress: "Iron", stack: { typeId: "createbedrock:brass_sheet" }, tagsFor: () => ["createbedrock:brass_sheet"] }), false);
	assert.equal(filterExpressionMatches({ mode: "deny", typeIds: ["minecraft:cobblestone"] }, { stack: { typeId: "minecraft:iron_ingot" } }), true);
	assert.equal(filterExpressionMatches({ mode: "deny" }, { stack: { typeId: "minecraft:iron_ingot" } }), true);
});
