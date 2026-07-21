import assert from "node:assert/strict";
import test from "node:test";

import { matchesSequencedAssemblyTag, sequencedAssemblyTagItems } from "../behavior_pack/scripts/processing/sequenced-assembly-tags.js";

test("sequenced assembly projects every Java tag to its exact Bedrock item family", () => {
	assert.equal(matchesSequencedAssemblyTag("c:plates/gold", "createbedrock:golden_sheet"), true);
	assert.equal(matchesSequencedAssemblyTag("c:nuggets/iron", "minecraft:iron_nugget"), true);
	assert.equal(matchesSequencedAssemblyTag("c:nuggets/zinc", "createbedrock:zinc_nugget"), true);
	assert.equal(matchesSequencedAssemblyTag("c:dusts/obsidian", "createbedrock:powdered_obsidian"), true);
	assert.deepEqual(sequencedAssemblyTagItems("create:sleepers"), ["minecraft:andesite_slab", "minecraft:smooth_stone_slab", "minecraft:stone_slab"]);
	assert.equal(matchesSequencedAssemblyTag("create:sleepers", "minecraft:oak_slab"), false);
});
